-- Record explicit investor agreement closure/cancellation metadata.
-- This migration does not delete or alter any financial ledger entries.
alter table public.investments
  add column if not exists closed_at timestamptz,
  add column if not exists closure_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.investments
  drop constraint if exists investments_closure_metadata_check;

alter table public.investments
  add constraint investments_closure_metadata_check
  check (
    (status <> 'closed' or (closed_at is not null and nullif(trim(closure_reason), '') is not null))
    and
    (status <> 'cancelled' or (cancelled_at is not null and nullif(trim(cancellation_reason), '') is not null))
  );
