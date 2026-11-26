-- REGNUM legacy (gammalobo): investor accounting extension
-- Apply in Supabase SQL Editor after taking a database backup.
create extension if not exists pgcrypto;
create table if not exists public.investors (
 id uuid primary key default gen_random_uuid(), full_name text not null, phone text, email text, notes text, created_at timestamptz not null default now()
);
create table if not exists public.investments (
 id uuid primary key default gen_random_uuid(), investor_id uuid not null references public.investors(id) on delete restrict,
 principal numeric(14,2) not null check (principal > 0), monthly_rate numeric(8,4) not null check (monthly_rate >= 0),
 start_date date not null, maturity_date date not null, term_months integer not null check (term_months > 0),
 payout_schedule text not null default 'monthly' check (payout_schedule in ('monthly','maturity','custom')),
 custom_interval_months integer not null default 1 check (custom_interval_months > 0), note text,
 status text not null default 'active' check (status in ('active','matured','closed','cancelled')),
 funded_at timestamptz, created_at timestamptz not null default now(), check (maturity_date > start_date)
);
create table if not exists public.investor_accruals (
 id uuid primary key default gen_random_uuid(), investment_id uuid not null references public.investments(id) on delete restrict,
 period_start date not null, period_end date not null, amount numeric(14,2) not null check (amount >= 0),
 created_at timestamptz not null default now(), unique(investment_id,period_start), check(period_end > period_start)
);
create table if not exists public.investor_payments (
 id uuid primary key default gen_random_uuid(), investment_id uuid not null references public.investments(id) on delete restrict,
 payment_type text not null check (payment_type in ('interest','principal')), amount numeric(14,2) not null check (amount > 0),
 payment_date date not null default current_date, note text, created_at timestamptz not null default now()
);
alter table public.investors enable row level security;
alter table public.investments enable row level security;
alter table public.investor_accruals enable row level security;
alter table public.investor_payments enable row level security;
drop policy if exists "Authenticated users manage investors" on public.investors;
create policy "Authenticated users manage investors" on public.investors for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users manage investments" on public.investments;
create policy "Authenticated users manage investments" on public.investments for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users manage investor accruals" on public.investor_accruals;
create policy "Authenticated users manage investor accruals" on public.investor_accruals for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated users manage investor payments" on public.investor_payments;
create policy "Authenticated users manage investor payments" on public.investor_payments for all to authenticated using (true) with check (true);
create or replace function public.accrue_investor_interest()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_count integer := 0; v_row record; v_start date; v_end date; v_inserted integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 for v_row in select * from public.investments where status='active' and funded_at is not null and start_date < current_date loop
  v_start := (v_row.start_date + interval '1 month')::date;
  while v_start <= least(current_date,v_row.maturity_date) loop
   v_end := (v_start + interval '1 month')::date;
   insert into public.investor_accruals(investment_id,period_start,period_end,amount)
   values(v_row.id,(v_start - interval '1 month')::date,least(v_end,v_row.maturity_date),round(v_row.principal*v_row.monthly_rate/100,2))
   on conflict(investment_id,period_start) do nothing;
   get diagnostics v_inserted = row_count; v_count := v_count + v_inserted; v_start := v_end;
  end loop;
 end loop;
 return jsonb_build_object('created_count',v_count);
end; $$;
grant execute on function public.accrue_investor_interest() to authenticated;
