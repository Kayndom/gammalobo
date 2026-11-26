-- Investor accounting for gammalobo.
-- Apply after a verified database backup. Existing borrower/guarantor security policies are unchanged.
-- Investor funds are liabilities, not owner capital or business revenue.

create extension if not exists pgcrypto;

create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete restrict,
  principal numeric(14,2) not null check (principal > 0),
  monthly_rate numeric(8,4) not null check (monthly_rate >= 0),
  start_date date not null,
  maturity_date date not null,
  term_months integer not null check (term_months > 0),
  payout_schedule text not null default 'monthly'
    check (payout_schedule in ('monthly','maturity','custom')),
  custom_interval_months integer not null default 1 check (custom_interval_months > 0),
  note text,
  status text not null default 'pending_funding'
    check (status in ('pending_funding','active','matured','closed','cancelled')),
  funded_at timestamptz,
  created_at timestamptz not null default now(),
  check (maturity_date > start_date),
  check ((status = 'pending_funding' and funded_at is null) or
         (status <> 'pending_funding' and status <> 'cancelled' and funded_at is not null) or
         status = 'cancelled')
);

create table if not exists public.investor_accruals (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique(investment_id,period_start),
  check(period_end > period_start)
);

create table if not exists public.investor_payments (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments(id) on delete restrict,
  payment_type text not null check (payment_type in ('interest','principal')),
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

alter table public.investors enable row level security;
alter table public.investments enable row level security;
alter table public.investor_accruals enable row level security;
alter table public.investor_payments enable row level security;

drop policy if exists "Authenticated users manage investors" on public.investors;
create policy "Authenticated users manage investors" on public.investors
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "Authenticated users manage investments" on public.investments;
create policy "Authenticated users manage investments" on public.investments
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "Authenticated users manage investor accruals" on public.investor_accruals;
create policy "Authenticated users manage investor accruals" on public.investor_accruals
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "Authenticated users manage investor payments" on public.investor_payments;
create policy "Authenticated users manage investor payments" on public.investor_payments
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- Generate idempotent simple-interest accruals, prorating partial calendar months.
create or replace function public.accrue_investor_interest()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row record;
  v_index integer;
  v_period_start date;
  v_period_end date;
  v_next_anniversary date;
  v_days_in_period integer;
  v_days_elapsed integer;
  v_amount numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.investments
  set status = 'matured'
  where status = 'active' and maturity_date <= current_date;

  for v_row in
    select * from public.investments
    where status in ('active','matured')
      and funded_at is not null
      and start_date < current_date
  loop
    for v_index in 0..greatest(0, v_row.term_months - 1) loop
      v_period_start := (v_row.start_date + make_interval(months => v_index))::date;
      v_next_anniversary := (v_row.start_date + make_interval(months => v_index + 1))::date;
      exit when v_period_start >= least(current_date, v_row.maturity_date);

      v_period_end := least(v_next_anniversary, v_row.maturity_date, current_date);
      v_days_in_period := greatest(1, v_next_anniversary - v_period_start);
      v_days_elapsed := greatest(0, v_period_end - v_period_start);
      v_amount := round(
        v_row.principal * (v_row.monthly_rate / 100)
        * (v_days_elapsed::numeric / v_days_in_period::numeric),
        2
      );

      insert into public.investor_accruals
        (investment_id, period_start, period_end, amount)
      values
        (v_row.id, v_period_start, v_period_end, v_amount)
      on conflict (investment_id, period_start)
      do update set
        period_end = excluded.period_end,
        amount = excluded.amount;

      v_count := v_count + 1;
    end loop;
  end loop;

  return jsonb_build_object('periods_updated', v_count);
end;
$$;

grant execute on function public.accrue_investor_interest() to authenticated;

-- Prevent payments beyond the principal received or interest accrued.
create or replace function public.validate_investor_payment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_investment public.investments%rowtype;
  v_limit numeric(14,2);
  v_paid numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_investment
  from public.investments
  where id = new.investment_id
  for update;

  if not found or v_investment.funded_at is null or v_investment.status = 'cancelled' then
    raise exception 'Investment is not eligible for payment';
  end if;

  if new.payment_type = 'principal' then
    v_limit := v_investment.principal;
  else
    select coalesce(sum(amount),0) into v_limit
    from public.investor_accruals
    where investment_id = new.investment_id;
  end if;

  select coalesce(sum(amount),0) into v_paid
  from public.investor_payments
  where investment_id = new.investment_id
    and payment_type = new.payment_type;

  if v_paid + new.amount > v_limit then
    raise exception 'Payment exceeds the outstanding % amount', new.payment_type;
  end if;

  return new;
end;
$$;

drop trigger if exists investor_payment_limit on public.investor_payments;
create trigger investor_payment_limit
before insert on public.investor_payments
for each row execute function public.validate_investor_payment();
