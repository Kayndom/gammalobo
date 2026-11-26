-- Make borrower repayment and rollover operations atomic.
-- Each RPC locks the loan row and commits all ledger/balance/log changes together.

create or replace function public.record_loan_repayment(
  p_loan_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loan public.loans%rowtype;
  v_paid numeric(14,2);
  v_principal_paid numeric(14,2);
  v_principal_remaining numeric(14,2);
  v_allocated_principal numeric(14,2);
  v_allocated_interest numeric(14,2);
  v_new_paid numeric(14,2);
  v_new_balance numeric(14,2);
  v_new_status text;
  v_instalment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid positive payment amount'; end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active','overdue') then raise exception 'This loan is not open for repayment'; end if;
  if p_amount > coalesce(v_loan.outstanding_balance,0) then
    raise exception 'Payment exceeds the current outstanding balance';
  end if;

  select coalesce(sum(amount_paid),0), coalesce(sum(allocated_principal),0)
    into v_paid, v_principal_paid
    from public.instalments
    where loan_id = p_loan_id and coalesce(rollover_number,0) = coalesce(v_loan.rollover_count,0);

  -- The loan row is authoritative for its current-cycle cumulative paid amount.
  v_new_paid := coalesce(v_loan.amount_paid,0) + p_amount;
  v_new_balance := greatest(0, coalesce(v_loan.total_owed,0) - v_new_paid);
  if v_new_balance < 0.01 then v_new_balance := 0; end if;

  v_principal_remaining := greatest(0, coalesce(v_loan.principal,0) - v_principal_paid);
  v_allocated_principal := least(p_amount, v_principal_remaining);
  v_allocated_interest := p_amount - v_allocated_principal;
  v_new_status := case when v_new_balance = 0 then 'settled'
                       when v_loan.status = 'overdue' then 'overdue'
                       else 'active' end;

  insert into public.instalments
    (loan_id, amount_paid, allocated_principal, allocated_interest, rollover_number, payment_date, note)
  values
    (p_loan_id, p_amount, v_allocated_principal, v_allocated_interest,
     coalesce(v_loan.rollover_count,0), p_payment_date, p_note)
  returning id into v_instalment_id;

  update public.loans
    set amount_paid = v_new_paid,
        outstanding_balance = v_new_balance,
        status = v_new_status
    where id = p_loan_id;

  insert into public.loan_logs(loan_id, activity_type, description, amount, balance_after)
  values (p_loan_id, 'payment',
    'Payment received: ₦' || to_char(p_amount, 'FM999,999,999,990.00') ||
      case when nullif(trim(p_note),'') is not null then ' — ' || trim(p_note) else '' end,
    p_amount, v_new_balance);

  if v_new_status = 'settled' then
    insert into public.loan_logs(loan_id, activity_type, description, amount, balance_after)
    values (p_loan_id, 'settled', 'Loan fully settled. All payments received.', 0, 0);
  end if;

  return jsonb_build_object(
    'instalment_id', v_instalment_id,
    'amount_paid', v_new_paid,
    'outstanding_balance', v_new_balance,
    'status', v_new_status,
    'allocated_principal', v_allocated_principal,
    'allocated_interest', v_allocated_interest,
    'rollover_number', coalesce(v_loan.rollover_count,0)
  );
end;
$$;

create or replace function public.rollover_loan(
  p_loan_id uuid,
  p_start_date date,
  p_interest_rate numeric,
  p_duration_days integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loan public.loans%rowtype;
  v_previous_outstanding numeric(14,2);
  v_new_principal numeric(14,2);
  v_interest numeric(14,2);
  v_total numeric(14,2);
  v_new_count integer;
  v_due_date date;
  v_rollover_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_start_date is null or p_interest_rate is null or p_interest_rate < 0
     or p_duration_days is null or p_duration_days < 1 then
    raise exception 'Enter a valid rollover date, interest rate and duration';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active','overdue') then raise exception 'Only an open loan can be rolled over'; end if;
  if coalesce(v_loan.outstanding_balance,0) <= 0 then raise exception 'There is no outstanding balance to roll over'; end if;

  v_previous_outstanding := v_loan.outstanding_balance;
  v_new_principal := v_previous_outstanding;
  v_interest := round(v_new_principal * p_interest_rate / 100, 2);
  v_total := v_new_principal + v_interest;
  v_new_count := coalesce(v_loan.rollover_count,0) + 1;
  v_due_date := p_start_date + p_duration_days;

  insert into public.rollovers
    (loan_id, rollover_number, previous_outstanding, new_principal,
     new_interest_rate, new_interest_amount, new_total_owed, rolled_over_at, new_due_date)
  values
    (p_loan_id, v_new_count, v_previous_outstanding, v_new_principal,
     p_interest_rate, v_interest, v_total, p_start_date, v_due_date)
  returning id into v_rollover_id;

  update public.loans
    set principal = v_new_principal,
        interest_rate = p_interest_rate,
        interest_amount = v_interest,
        total_owed = v_total,
        amount_paid = 0,
        outstanding_balance = v_total,
        loan_type = 'rollover',
        rollover_count = v_new_count,
        last_rolled_over_at = p_start_date::timestamp,
        due_date = v_due_date::timestamp,
        status = 'active',
        disbursed_at = p_start_date::timestamp
    where id = p_loan_id;

  insert into public.loan_logs(loan_id, activity_type, description, amount, balance_after)
  values
    (p_loan_id, 'overdue',
     'Loan became overdue. Outstanding balance at rollover: ₦' || to_char(v_previous_outstanding, 'FM999,999,999,990.00'),
     v_previous_outstanding, v_previous_outstanding),
    (p_loan_id, 'rollover',
     'Loan rolled over from ' || p_start_date::text ||
       '. New principal: ₦' || to_char(v_new_principal, 'FM999,999,999,990.00') ||
       ', Interest (' || p_interest_rate::text || '%): ₦' || to_char(v_interest, 'FM999,999,999,990.00') ||
       ', Duration: ' || p_duration_days::text || ' days, New total: ₦' ||
       to_char(v_total, 'FM999,999,999,990.00') || ', New due date: ' || v_due_date::text,
     v_total, v_total);

  return jsonb_build_object(
    'rollover_id', v_rollover_id,
    'rollover_number', v_new_count,
    'previous_outstanding', v_previous_outstanding,
    'new_principal', v_new_principal,
    'interest_amount', v_interest,
    'total_owed', v_total,
    'due_date', v_due_date
  );
end;
$$;

revoke all on function public.record_loan_repayment(uuid,numeric,date,text) from public, anon;
revoke all on function public.rollover_loan(uuid,date,numeric,integer) from public, anon;
grant execute on function public.record_loan_repayment(uuid,numeric,date,text) to authenticated;
grant execute on function public.rollover_loan(uuid,date,numeric,integer) to authenticated;
