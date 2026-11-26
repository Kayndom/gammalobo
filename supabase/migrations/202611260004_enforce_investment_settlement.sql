-- Enforce investor agreement settlement before closure at the database level.
-- Also serialize accrual writes against closure so no new interest can appear after settlement is checked.

create or replace function public.prevent_unsettled_investment_closure()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_accrued numeric(14,2);
  v_interest_paid numeric(14,2);
  v_principal_paid numeric(14,2);
  v_principal_due numeric(14,2);
  v_interest_due numeric(14,2);
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if new.funded_at is null or old.status not in ('active', 'matured') then
      raise exception 'Only a funded active or matured investment can be closed';
    end if;

    select coalesce(sum(amount), 0)
      into v_accrued
      from public.investor_accruals
      where investment_id = old.id;

    select
      coalesce(sum(amount) filter (where payment_type = 'principal'), 0),
      coalesce(sum(amount) filter (where payment_type = 'interest'), 0)
      into v_principal_paid, v_interest_paid
      from public.investor_payments
      where investment_id = old.id;

    v_principal_due := greatest(0, old.principal - v_principal_paid);
    v_interest_due := greatest(0, v_accrued - v_interest_paid);

    if v_principal_due > 0.009 or v_interest_due > 0.009 then
      raise exception
        'Investment has an outstanding balance: principal due %, accrued interest due %',
        v_principal_due, v_interest_due;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_unsettled_investment_closure on public.investments;
create trigger prevent_unsettled_investment_closure
before update of status on public.investments
for each row
execute function public.prevent_unsettled_investment_closure();

-- Accrual writes lock the parent investment row. This prevents an accrual from
-- being inserted concurrently after the closure trigger checks the balance.
create or replace function public.guard_investor_accrual_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_funded_at timestamptz;
begin
  select status, funded_at
    into v_status, v_funded_at
    from public.investments
    where id = new.investment_id
    for update;

  if not found or v_funded_at is null or v_status not in ('active', 'matured') then
    raise exception 'Interest can only accrue on a funded active or matured investment';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_investor_accrual_write on public.investor_accruals;
create trigger guard_investor_accrual_write
before insert or update on public.investor_accruals
for each row
execute function public.guard_investor_accrual_write();
