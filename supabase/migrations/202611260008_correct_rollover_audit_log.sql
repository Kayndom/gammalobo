-- Correct rollover audit history: only log an overdue event when the loan
-- was actually marked overdue before the rollover.
-- The rollover, loan update, and audit entries remain one atomic transaction.

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

  if v_loan.status = 'overdue' then
    insert into public.loan_logs(loan_id, activity_type, description, amount, balance_after)
    values (
      p_loan_id,
      'overdue',
      'Loan was overdue when rollover was started. Outstanding balance: ₦' ||
        to_char(v_previous_outstanding, 'FM999,999,999,990.00'),
      v_previous_outstanding,
      v_previous_outstanding
    );
  end if;

  insert into public.loan_logs(loan_id, activity_type, description, amount, balance_after)
  values (
    p_loan_id,
    'rollover',
    'Loan rolled over from ' || p_start_date::text ||
      '. New principal: ₦' || to_char(v_new_principal, 'FM999,999,999,990.00') ||
      ', Interest (' || p_interest_rate::text || '%): ₦' || to_char(v_interest, 'FM999,999,999,990.00') ||
      ', Duration: ' || p_duration_days::text || ' days, New total: ₦' ||
      to_char(v_total, 'FM999,999,999,990.00') || ', New due date: ' || v_due_date::text,
    v_total,
    v_total
  );

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

revoke all on function public.rollover_loan(uuid,date,numeric,integer) from public, anon;
grant execute on function public.rollover_loan(uuid,date,numeric,integer) to authenticated;
