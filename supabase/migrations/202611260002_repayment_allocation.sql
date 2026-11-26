-- Explicit repayment allocation for accurate cash-basis interest reporting.
-- Payments are allocated to principal first, then interest.
-- Rollover number separates payment allocation across loan cycles.

alter table public.instalments
  add column if not exists allocated_principal numeric(14,2) not null default 0
    check (allocated_principal >= 0),
  add column if not exists allocated_interest numeric(14,2) not null default 0
    check (allocated_interest >= 0),
  add column if not exists rollover_number integer not null default 0
    check (rollover_number >= 0);

create index if not exists instalments_loan_cycle_idx
  on public.instalments (loan_id, rollover_number);
