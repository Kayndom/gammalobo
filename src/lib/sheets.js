import { SHEETS_URL } from './supabase'

async function sendToSheets(sheet, headers, row) {
  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet, headers, row }),
      mode: 'no-cors',
    })
  } catch (err) {
    console.error('Sheets sync error:', err)
  }
}

export async function logLoanToSheets(loan, applicant, guarantor) {
  await sendToSheets(
    'Loans',
    ['ID', 'Loanee', 'Phone', 'Guarantor', 'Guarantor Phone', 'Principal', 'Interest Rate', 'Interest Amount', 'Total Owed', 'Amount Paid', 'Outstanding', 'Type', 'Status', 'Rollover Count', 'Disbursed At', 'Due Date'],
    [
      loan.id,
      applicant?.full_name,
      applicant?.phone,
      guarantor?.full_name,
      guarantor?.phone,
      loan.principal,
      loan.interest_rate,
      loan.interest_amount,
      loan.total_owed,
      loan.amount_paid,
      loan.outstanding_balance,
      loan.loan_type,
      loan.status,
      loan.rollover_count,
      loan.disbursed_at,
      loan.due_date,
    ]
  )
}

export async function logPaymentToSheets(payment, loanee) {
  await sendToSheets(
    'Payments',
    ['ID', 'Loan ID', 'Loanee', 'Amount Paid', 'Payment Date', 'Note', 'Recorded At'],
    [
      payment.id,
      payment.loan_id,
      loanee,
      payment.amount_paid,
      payment.payment_date,
      payment.note,
      payment.recorded_at,
    ]
  )
}

export async function logApplicationToSheets(app, applicant, guarantor) {
  await sendToSheets(
    'Applications',
    ['ID', 'Loanee', 'Phone', 'Guarantor', 'Guarantor Phone', 'Amount Requested', 'Status', 'Created At'],
    [
      app.id,
      applicant?.full_name,
      applicant?.phone,
      guarantor?.full_name,
      guarantor?.phone,
      app.loan_amount_requested,
      app.status,
      app.created_at,
    ]
  )
}

export async function logLoaneeToSheets(loanee) {
  await sendToSheets(
    'Loanees',
    ['ID', 'Full Name', 'Phone', 'Email', 'Address', 'Occupation', 'BVN', 'NIN', 'Bank', 'Account Number', 'Account Name', 'Created At'],
    [
      loanee.id,
      loanee.full_name,
      loanee.phone,
      loanee.email,
      loanee.address,
      loanee.occupation,
      loanee.bvn,
      loanee.nin,
      loanee.bank_name,
      loanee.account_number,
      loanee.account_name,
      loanee.created_at,
    ]
  )
}