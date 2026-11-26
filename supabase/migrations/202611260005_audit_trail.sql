-- Append-only audit trail for important business and financial records.
-- Captures database writes automatically; no existing business rows are modified.

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb
);

alter table public.audit_logs enable row level security;
drop policy if exists "Authenticated users can read audit logs" on public.audit_logs;
create policy "Authenticated users can read audit logs"
  on public.audit_logs for select to authenticated
  using (auth.uid() is not null);

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
revoke all on sequence public.audit_logs_id_seq from anon, authenticated;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Audit history is append-only and cannot be changed or deleted';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

create or replace function public.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
begin
  if v_actor is not null then
    select email into v_email from auth.users where id = v_actor;
  else
    v_email := 'Public link / backend process';
  end if;

  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old) - array[
      'full_name','phone','email','address','nin','bvn','identity_number',
      'document_number','token','access_token','password','password_hash'
    ];
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new) - array[
      'full_name','phone','email','address','nin','bvn','identity_number',
      'document_number','token','access_token','password','password_hash'
    ];
  end if;

  if tg_op = 'DELETE' then
    v_record_id := coalesce(v_old->>'id', v_old->>'loan_id', v_old->>'investment_id');
  else
    v_record_id := coalesce(v_new->>'id', v_new->>'loan_id', v_new->>'investment_id');
  end if;

  insert into public.audit_logs(actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (v_actor, v_email, tg_op, tg_table_name, v_record_id, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  t text;
  tracked_tables text[] := array[
    'applications','applicants','guarantors','loans','instalments','loan_logs',
    'rollovers','investors','investments','investor_accruals','investor_payments',
    'capital_injections','profit_withdrawals'
  ];
begin
  foreach t in array tracked_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_business_changes on public.%I', t);
      execute format(
        'create trigger audit_business_changes after insert or update or delete on public.%I for each row execute function public.capture_audit_log()',
        t
      );
    end if;
  end loop;
end;
$$;

comment on table public.audit_logs is
  'Append-only record of inserts, updates and deletes on key business and financial tables. Personal contact and identity fields are excluded from snapshots.';
