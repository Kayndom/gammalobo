-- Controlled, additive recovery from a validated REGNUM v2 JSON backup.
-- Authenticated admin only. Inserts missing IDs; never overwrites or deletes.
-- All work is one transaction: any constraint/trigger failure rolls back the entire restore.

create or replace function public.restore_regnum_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_tables text[] := array[
    'settings','applicants','investors','capital_injections','profit_withdrawals',
    'guarantors','applications','loans','rollovers','instalments','loan_logs',
    'investments','investor_accruals','investor_payments','audit_logs'
  ];
  v_table text;
  v_count bigint;
  v_distinct bigint;
  v_conflicts bigint;
  v_inserted bigint;
  v_counts jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_max_id bigint;
  v_backup_audit_max bigint;
  v_sequence text;
begin
  if auth.uid() is null then
    raise exception 'An authenticated administrator must be signed in to restore a backup';
  end if;

  if p_backup->>'format' <> 'REGNUM_COMPLETE_APP_DATA_BACKUP'
     or (p_backup->>'version')::integer <> 2 then
    raise exception 'Unsupported backup format or version';
  end if;
  if jsonb_typeof(p_backup->'tables') <> 'object' then
    raise exception 'Backup tables section is missing';
  end if;

  -- Block concurrent writes while checking and restoring, but continue to allow reads.
  lock table public.settings, public.applicants, public.guarantors, public.applications,
    public.loans, public.instalments, public.loan_logs, public.rollovers,
    public.capital_injections, public.profit_withdrawals, public.investors,
    public.investments, public.investor_accruals, public.investor_payments,
    public.audit_logs in share row exclusive mode;

  -- Validate every table and reject duplicate IDs or differing records before inserting anything.
  foreach v_table in array v_tables loop
    if jsonb_typeof(p_backup->'tables'->v_table) <> 'array' then
      raise exception 'Backup table % is missing or is not an array', v_table;
    end if;

    execute format(
      'select count(*), count(distinct id), count(id) from jsonb_populate_recordset(null::public.%I, $1)',
      v_table
    ) into v_count, v_distinct, v_inserted
    using p_backup->'tables'->v_table;

    if v_count <> v_distinct or v_count <> v_inserted then
      raise exception 'Backup table % contains duplicate or missing record IDs', v_table;
    end if;

    execute format(
      'select count(*) from jsonb_populate_recordset(null::public.%I, $1) b join public.%I live on live.id = b.id where to_jsonb(live) is distinct from to_jsonb(b)',
      v_table, v_table
    ) into v_conflicts
    using p_backup->'tables'->v_table;

    if v_conflicts > 0 then
      raise exception 'Restore stopped: % conflicting record(s) in table %. No records were changed.', v_conflicts, v_table;
    end if;
  end loop;

  -- Restore historical audit rows first and advance the identity sequence.
  -- New audit events produced by restore triggers will then use higher IDs.
  select max(id) into v_backup_audit_max
  from jsonb_populate_recordset(null::public.audit_logs, p_backup->'tables'->'audit_logs');

  execute
    'insert into public.audit_logs overriding system value
     select (jsonb_populate_recordset(null::public.audit_logs, $1)).*
     on conflict (id) do nothing'
  using p_backup->'tables'->'audit_logs';
  get diagnostics v_inserted = row_count;
  v_counts := jsonb_build_object('audit_logs', v_inserted);

  select greatest(coalesce((select max(id) from public.audit_logs), 0),
                  coalesce(v_backup_audit_max, 0),
                  (select last_value from public.audit_logs_id_seq))
    into v_max_id;
  v_sequence := pg_get_serial_sequence('public.audit_logs', 'id');
  if v_sequence is not null and v_max_id > 0 then
    perform setval(v_sequence, v_max_id, true);
  end if;

  -- Parent records first, then dependent loan and investor records.
  foreach v_table in array v_tables loop
    if v_table = 'audit_logs' then
      continue;
    elsif v_table = 'investments' then
      -- Temporarily insert closed agreements as active so their historical
      -- accruals pass the existing accrual guard; close them after payments.
      select coalesce(jsonb_agg(case when item->>'status' = 'closed'
        then jsonb_set(item, '{status}', '"active"'::jsonb) else item end), '[]'::jsonb)
        into v_rows
        from jsonb_array_elements(p_backup->'tables'->v_table) as items(item);
      execute 'insert into public.investments
        select (jsonb_populate_recordset(null::public.investments, $1)).*
        on conflict (id) do nothing' using v_rows;
    else
      execute format('insert into public.%I select (jsonb_populate_recordset(null::public.%I, $1)).* on conflict (id) do nothing', v_table, v_table)
        using p_backup->'tables'->v_table;
    end if;
    get diagnostics v_inserted = row_count;
    v_counts := v_counts || jsonb_build_object(v_table, v_inserted);
  end loop;
  -- Reapply closed status only after all linked repayments/accruals are present.
  update public.investments i
  set status = 'closed'
  where i.status <> 'closed'
    and i.id in (
      select (item->>'id')::uuid
      from jsonb_array_elements(p_backup->'tables'->'investments') as items(item)
      where item->>'status' = 'closed'
    );

  -- Keep the identity sequence ahead of explicitly restored audit IDs.
  select max(id) into v_max_id from public.audit_logs;
  v_sequence := pg_get_serial_sequence('public.audit_logs', 'id');
  if v_sequence is not null then
    if v_max_id is null then
      perform setval(v_sequence, 1, false);
    else
      perform setval(v_sequence, v_max_id, true);
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'inserted_by_table', v_counts,
    'total_inserted', (select coalesce(sum(value::text::bigint), 0) from jsonb_each(v_counts)),
    'message', 'Missing records restored. Existing records were not overwritten or deleted.'
  );
end;
$$;

revoke all on function public.restore_regnum_backup(jsonb) from public, anon;
grant execute on function public.restore_regnum_backup(jsonb) to authenticated;

comment on function public.restore_regnum_backup(jsonb) is
  'Atomic additive restore of a REGNUM v2 backup. Requires authentication; refuses conflicting IDs; never updates or deletes existing business records.';
