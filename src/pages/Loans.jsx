import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { logLoanToSheets, logPaymentToSheets } from '../lib/sheets'

function LoanLedger({ loanId, loan, onPrint }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLogs() {
      const { data } = await supabase
        .from('loan_logs')
        .select('*')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: true })
      if (data) setLogs(data)
      setLoading(false)
    }
    fetchLogs()
  }, [loanId])

  const activityStyles = {
    disbursement: { color: '#1e3a5f', bg: '#eff6ff', label: '🏦 Loan Disbursed' },
    payment: { color: '#16a34a', bg: '#f0fdf4', label: '💳 Payment Received' },
    settled: { color: '#16a34a', bg: '#f0fdf4', label: '✅ Loan Settled' },
    overdue: { color: '#dc2626', bg: '#fef2f2', label: '⚠️ Loan Overdue' },
    rollover: { color: '#ea580c', bg: '#fff7ed', label: '🔄 Loan Rolled Over' },
  }

  return (
    <div className="border-t pt-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-gray-700">Loan Ledger</h3>
        <button
          onClick={onPrint}
          className="text-xs px-3 py-1 rounded-lg font-semibold"
          style={{ background: '#f1f5f9', color: '#1e3a5f' }}
        >
          Print Ledger
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Loading ledger...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-gray-400">No activity logged yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log, index) => {
            const style = activityStyles[log.activity_type] || { color: '#64748b', bg: '#f8fafc', label: log.activity_type }
            return (
              <div key={log.id} className="rounded-xl p-3" style={{ background: style.bg }}>
                <div className="flex justify-between items-start mb-1">
                  <p className="text-xs font-bold" style={{ color: style.color }}>{style.label}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{log.description}</p>
                <p className="text-xs font-bold mt-1" style={{ color: style.color }}>
                  Balance: ₦{Number(log.balance_after).toLocaleString()}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
export default function Loans() {
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [instalment, setInstalment] = useState({ amount: '', date: '', note: '' })
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')
  const [approvedApps, setApprovedApps] = useState([])
  const [disbursing, setDisbursing] = useState(null)
  const [rollovers, setRollovers] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => { fetchLoans() }, [])

  async function fetchLoans() {
    await supabase.rpc('check_overdue_loans')
    const { data } = await supabase
      .from('loans')
      .select(`*, applicants(*), guarantors(*), instalments(*)`)
      .order('created_at', { ascending: false })
    if (data) setLoans(data)
    setLoading(false)
  }

  useEffect(() => {
    async function fetchApproved() {
      const { data: allLoans } = await supabase
        .from('loans').select('application_id')
      const loanedAppIds = allLoans?.map(l => l.application_id) || []
      const { data: apps } = await supabase
        .from('applications')
        .select('*, applicants(*)')
        .eq('status', 'approved')
      const unloanedApps = apps?.filter(a => !loanedAppIds.includes(a.id)) || []
      setApprovedApps(unloanedApps)
    }
    fetchApproved()
  }, [loans])

  async function fetchRollovers(loanId) {
    const { data } = await supabase
      .from('rollovers')
      .select('*')
      .eq('loan_id', loanId)
      .order('rollover_number', { ascending: true })
    if (data) setRollovers(data)
  }

  async function createLoanFromApplication(app) {
    setDisbursing(app.id)
    const { data: settings } = await supabase
      .from('settings').select('*').single()
    const principal = app.loan_amount_requested
const rate = app.custom_interest_rate || settings.standard_interest_rate
const duration = app.custom_duration_days || settings.loan_duration_days
    const interest = (principal * rate) / 100
    const total = principal + interest
    const disbursedAt = new Date()
    const dueDate = new Date(disbursedAt)
    dueDate.setDate(dueDate.getDate() + duration)
    const { error } = await supabase.from('loans').insert({
      application_id: app.id,
      applicant_id: app.applicant_id,
      guarantor_id: app.guarantor_id,
      principal,
      interest_rate: rate,
      interest_amount: interest,
      total_owed: total,
      amount_paid: 0,
      outstanding_balance: total,
      loan_type: 'standard',
      rollover_count: 0,
      disbursed_at: disbursedAt.toISOString(),
      due_date: dueDate.toISOString(),
      status: 'active',
    })
    if (!error) {
  const { data: newLoan } = await supabase
    .from('loans')
    .select('*')
    .eq('application_id', app.id)
    .single()

  if (newLoan) {
    await logLoanToSheets(newLoan, app.applicants, app.applicants?.guarantors)
    await supabase.from('loan_logs').insert({
      loan_id: newLoan.id,
      activity_type: 'disbursement',
      description: `Loan disbursed to ${app.applicants?.full_name}. Principal: ₦${Number(principal).toLocaleString()}, Interest (${rate}%): ₦${Number(interest).toLocaleString()}, Total Owed: ₦${Number(total).toLocaleString()}, Due Date: ${dueDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      amount: total,
      balance_after: total,
    })
  }
  fetchLoans()
}
    setDisbursing(null)
  }

  async function addInstalment() {
    if (!instalment.amount || !instalment.date) return
    setAdding(true)
    setMessage('')
    const amount = parseFloat(instalment.amount.replace(/,/g, ''))
    const { error: instalmentError } = await supabase
      .from('instalments')
      .insert({
        loan_id: selectedLoan.id,
        amount_paid: amount,
        payment_date: instalment.date,
        note: instalment.note,
      })
    if (instalmentError) {
      setMessage('Error recording payment')
      setAdding(false)
      return
    }
    const newAmountPaid = (selectedLoan.amount_paid || 0) + amount
    const newOutstanding = selectedLoan.total_owed - newAmountPaid
    const newStatus = newOutstanding <= 0 ? 'settled' : 'active'
    await supabase.from('loans').update({
      amount_paid: newAmountPaid,
      outstanding_balance: newOutstanding <= 0 ? 0 : newOutstanding,
      status: newStatus,
    }).eq('id', selectedLoan.id)
    await supabase.from('loan_logs').insert({
  loan_id: selectedLoan.id,
  activity_type: 'payment',
  description: `Payment received: ₦${Number(amount).toLocaleString()}${instalment.note ? ` — ${instalment.note}` : ''}`,
  amount: amount,
  balance_after: newOutstanding <= 0 ? 0 : newOutstanding,
})

if (newStatus === 'settled') {
  await supabase.from('loan_logs').insert({
    loan_id: selectedLoan.id,
    activity_type: 'settled',
    description: 'Loan fully settled. All payments received.',
    amount: 0,
    balance_after: 0,
  })
}
    await logPaymentToSheets({
  id: Date.now().toString(),
  loan_id: selectedLoan.id,
  amount_paid: amount,
  payment_date: instalment.date,
  note: instalment.note,
  recorded_at: new Date().toISOString(),
}, selectedLoan.applicants?.full_name)
setInstalment({ amount: '', date: '', note: '' })
    setMessage('Payment recorded successfully')
    setAdding(false)
    const updatedLoan = {
      ...selectedLoan,
      amount_paid: newAmountPaid,
      outstanding_balance: newOutstanding <= 0 ? 0 : newOutstanding,
      status: newStatus,
    }
    setSelectedLoan(updatedLoan)
    fetchLoans()
  }

  async function handleRollover(loan) {
    const { data: settings } = await supabase
      .from('settings').select('*').single()
    const previousOutstanding = loan.outstanding_balance
    const newPrincipal = previousOutstanding
    const rate = settings.penalty_interest_rate
    const interest = (newPrincipal * rate) / 100
    const total = newPrincipal + interest
    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + settings.loan_duration_days)
    const newRolloverCount = (loan.rollover_count || 0) + 1

    const { error: loanError } = await supabase
      .from('loans')
      .update({
        principal: newPrincipal,
        interest_rate: rate,
        interest_amount: interest,
        total_owed: total,
        amount_paid: 0,
        outstanding_balance: total,
        loan_type: 'rollover',
        rollover_count: newRolloverCount,
        last_rolled_over_at: now.toISOString(),
        due_date: dueDate.toISOString(),
        status: 'active',
        disbursed_at: now.toISOString(),
      })
      .eq('id', loan.id)

    if (loanError) return

    await supabase.from('rollovers').insert({
      loan_id: loan.id,
      rollover_number: newRolloverCount,
      previous_outstanding: previousOutstanding,
      new_principal: newPrincipal,
      new_interest_rate: rate,
      new_interest_amount: interest,
      new_total_owed: total,
      new_due_date: dueDate.toISOString(),
    })
await supabase.from('loan_logs').insert([
  {
    loan_id: loan.id,
    activity_type: 'overdue',
    description: `Loan became overdue. Outstanding balance at rollover: ₦${Number(previousOutstanding).toLocaleString()}`,
    amount: previousOutstanding,
    balance_after: previousOutstanding,
  },
  {
    loan_id: loan.id,
    activity_type: 'rollover',
    description: `Loan rolled over. New principal: ₦${Number(newPrincipal).toLocaleString()}, Penalty interest (${rate}%): ₦${Number(interest).toLocaleString()}, New total: ₦${Number(total).toLocaleString()}, New due date: ${dueDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    amount: total,
    balance_after: total,
  }
])
    setSelectedLoan(null)
    setRollovers([])
    fetchLoans()
  }

  function getWhatsAppRolloverLink(loan) {
  const rawPhone = loan.guarantors?.phone || ''
  const phone = rawPhone.startsWith('0') ? '234' + rawPhone.slice(1) : rawPhone
  const message = `Hello ${loan.guarantors?.full_name}, this is to notify you that the loan for ${loan.applicants?.full_name} on Regnum Ventures  has been rolled over due to non-payment. A new loan term of 30 days has started at 20% interest. Outstanding amount: ₦${Number(loan.outstanding_balance).toLocaleString()}. You remain the guarantor for this loan.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

  async function printReceipt(loan, payment) {
  const { data: settings } = await supabase
    .from('settings').select('*').single()

  const receiptNo = `RCP-${Date.now().toString().slice(-6)}`

  const win = window.open('', '_blank')
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Receipt - ${loan.applicants?.full_name}</title>
      <style>
  * {
    margin: 0; padding: 0; box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: Arial, sans-serif;
    color: #111;
    background: white;
    padding: 16px;
    max-width: 680px;
    margin: 0 auto;
    font-size: 12px;
    line-height: 1.4;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .logo-block { display: flex; align-items: center; gap: 8px; }
  .logo-circle {
    width: 36px; height: 36px; border-radius: 8px;
    background: #1e3a5f;
    display: flex; align-items: center; justify-content: center;
    color: #c9a84c; font-size: 18px; font-weight: 900;
  }
  .business-name { font-size: 15px; font-weight: 900; color: #1e3a5f; }
  .business-sub { font-size: 10px; color: #333; }
  .doc-title { font-size: 12px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
  .doc-date { font-size: 10px; color: #333; text-align: right; margin-top: 2px; }

  .loan-summary {
    background: #1e3a5f;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    color: white;
  }
  .loan-summary-title { font-size: 10px; color: #a8c0d6; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; font-weight: 700; }
  .loan-amount { font-size: 26px; font-weight: 900; color: #c9a84c; margin-bottom: 8px; }
  .loan-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .loan-item {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 5px;
    padding: 6px 8px;
  }
  .loan-item-label { font-size: 9px; color: #a8c0d6; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .loan-item-value { font-size: 12px; font-weight: 800; color: #fff; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .section { margin-bottom: 10px; }
  .section-title {
    font-size: 10px; font-weight: 800; color: #1e3a5f;
    text-transform: uppercase; letter-spacing: 1px;
    margin-bottom: 6px; padding-bottom: 3px;
    border-bottom: 2px solid #1e3a5f;
  }
  .field { background: #f1f5f9; border-radius: 5px; padding: 6px 10px; margin-bottom: 5px; }
  .field-label { font-size: 9px; color: #444; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; font-weight: 700; }
  .field-value { font-size: 12px; font-weight: 700; color: #111; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }

  .repay-box {
    background: #f0fdf4; border: 2px solid #16a34a;
    border-radius: 6px; padding: 10px; margin-bottom: 8px;
  }
  .repay-title { font-size: 10px; font-weight: 800; color: #14532d; margin-bottom: 5px; text-transform: uppercase; }
  .repay-text { font-size: 12px; color: #14532d; font-weight: 600; line-height: 1.6; }

  .bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }

  .terms-box {
    background: #fff7ed; border: 2px solid #ea580c;
    border-radius: 6px; padding: 10px;
  }
  .terms-title { font-size: 10px; font-weight: 800; color: #9a3412; margin-bottom: 5px; text-transform: uppercase; }
  .terms-text { font-size: 11px; color: #7c2d12; line-height: 1.5; font-weight: 600; }

  .consent-box {
    background: #eff6ff; border: 2px solid #1e3a5f;
    border-radius: 6px; padding: 10px;
  }
  .consent-title { font-size: 10px; font-weight: 800; color: #1e3a5f; margin-bottom: 5px; text-transform: uppercase; }
  .consent-text { font-size: 11px; color: #1e3a5f; line-height: 1.5; font-weight: 500; }
  .consent-stamp {
    background: #1e3a5f; color: #c9a84c;
    border-radius: 5px; padding: 7px 10px;
    font-size: 10px; font-weight: 800;
    margin-top: 8px; text-align: center;
  }

  .footer {
    margin-top: 10px; padding-top: 8px;
    border-top: 2px solid #e2e8f0;
    text-align: center; font-size: 10px; color: #333;
    line-height: 1.5; font-weight: 500;
  }

  @media print {
    body { padding: 8px; }
    @page { margin: 6mm; size: A4 portrait; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
    </head>
    <body>

  <div class="header">
    <div class="logo-block">
      <div class="logo-circle">R</div>
      <div>
        <div class="business-name">${settings.business_name}</div>
        <div class="business-sub">Loan Management</div>
      </div>
    </div>
    <div>
      <div class="doc-title">Loan Agreement</div>
      <div class="doc-date">Date: ${new Date(loan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div class="doc-date">Due: ${new Date(loan.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  <div class="loan-summary">
    <div class="loan-summary-title">Loan Summary</div>
    <div class="loan-amount">₦${Number(loan.principal).toLocaleString()}</div>
    <div class="loan-grid">
      <div class="loan-item">
        <div class="loan-item-label">Total Repayment</div>
        <div class="loan-item-value">₦${Number(loan.total_owed).toLocaleString()}</div>
      </div>
      <div class="loan-item">
        <div class="loan-item-label">Interest Rate</div>
        <div class="loan-item-value">${displayRate}%</div>
      </div>
      <div class="loan-item">
        <div class="loan-item-label">Duration</div>
        <div class="loan-item-value">${displayDuration} days</div>
      </div>
      <div class="loan-item">
        <div class="loan-item-label">Interest Amount</div>
        <div class="loan-item-value">₦${Number(loan.interest_amount).toLocaleString()}</div>
      </div>
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title">Borrower Details</div>
      <div class="field">
        <div class="field-label">Full Name</div>
        <div class="field-value">${loan.applicants?.full_name}</div>
      </div>
      <div class="field">
        <div class="field-label">Phone</div>
        <div class="field-value">${loan.applicants?.phone}</div>
      </div>
      <div class="field">
        <div class="field-label">BVN</div>
        <div class="field-value">${loan.applicants?.bvn || 'N/A'}</div>
      </div>
      <div class="field">
        <div class="field-label">NIN</div>
        <div class="field-value">${loan.applicants?.nin || 'N/A'}</div>
      </div>
      <div class="field">
        <div class="field-label">Disbursement Account</div>
        <div class="field-value">${loan.applicants?.account_name}</div>
        <div class="field-value" style="color:#444; font-size:11px;">${loan.applicants?.account_number} · ${loan.applicants?.bank_name}</div>
      </div>
    </div>

    <div>
      <div class="section">
        <div class="section-title">Guarantor Details</div>
        <div class="field">
          <div class="field-label">Full Name</div>
          <div class="field-value">${loan.guarantors?.full_name}</div>
        </div>
        <div class="field">
          <div class="field-label">Phone</div>
          <div class="field-value">${loan.guarantors?.phone}</div>
        </div>
      </div>

      <div class="repay-box">
        <div class="repay-title">Repay To</div>
        <div class="repay-text">
          ${settings.repayment_account_name}<br>
          Bank: ${settings.repayment_bank}<br>
          Acc No: <strong>${settings.repayment_account_no}</strong>
        </div>
      </div>
    </div>
  </div>

  <div class="bottom-row">
    <div class="terms-box">
      <div class="terms-title">⚠️ Penalty for Missed Payments</div>
      <div class="terms-text">
        If repayment is not made by due date, a new loan term is created at
        <strong>20% interest</strong> for <strong>30 days</strong> while awaiting legal action.
        Collateral may be claimed.
      </div>
    </div>

    <div class="consent-box">
      <div class="consent-title">✓ Digital Consent</div>
      <div class="consent-text">
        Accepted digitally by <strong>${loan.applicants?.full_name}</strong> on
        <strong>${new Date(loan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
        By submitting the application, the borrower and guarantor agreed to all terms on the
        ${settings.business_name} platform.
      </div>
      <div class="consent-stamp">
        ✓ DIGITALLY ACCEPTED · ${new Date(loan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
    </div>
  </div>

  <div class="footer">
    ${settings.business_name} &nbsp;·&nbsp; ${settings.repayment_bank} &nbsp;·&nbsp; ${settings.repayment_account_no}
    <br>This is a legally binding digital loan agreement.
  </div>

  <script>window.onload = function() { window.print() }</script>
</body>
    </html>
  `)
  win.document.close()
}

  async function printLoanAgreement(loan) {
  const { data: settings } = await supabase
    .from('settings').select('*').single()

  const { data: appData } = await supabase
    .from('applications')
    .select('custom_interest_rate, custom_duration_days')
    .eq('id', loan.application_id)
    .single()

  const displayRate = loan.interest_rate
  const displayDuration = appData?.custom_duration_days || settings.loan_duration_days

  const win = window.open('', '_blank')
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Loan Agreement - ${loan.applicants?.full_name}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  @page {
    size: A4 portrait;
    margin: 5mm;
  }

  body {
    font-family: Arial, sans-serif;
    color: #111;
    background: #fff;

    /* Responsive for mobile + A4 */
    width: min(100%, 794px);
    margin: 0 auto;
    padding: 12px;

    font-size: 11px;
    line-height: 1.3;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }

  .logo-block {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-circle {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #1e3a5f;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c9a84c;
    font-size: 18px;
    font-weight: 900;
  }

  .business-name {
    font-size: 15px;
    font-weight: 900;
    color: #1e3a5f;
  }

  .business-sub {
    font-size: 10px;
    color: #333;
  }

  .doc-title {
    font-size: 12px;
    font-weight: 800;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-align: right;
  }

  .doc-date {
    font-size: 10px;
    color: #333;
    text-align: right;
    margin-top: 2px;
  }

  .loan-summary {
    background: #1e3a5f;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 10px;
    color: white;
  }

  .loan-summary-title {
    font-size: 10px;
    color: #a8c0d6;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 5px;
    font-weight: 700;
  }

  .loan-amount {
    font-size: 24px;
    font-weight: 900;
    color: #c9a84c;
    margin-bottom: 8px;
  }

  .loan-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .loan-item {
    background: rgba(255,255,255,.12);
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 5px;
    padding: 6px;
  }

  .loan-item-label {
    font-size: 8px;
    color: #a8c0d6;
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-bottom: 2px;
  }

  .loan-item-value {
    font-size: 11px;
    font-weight: 800;
    color: #fff;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }

  .section {
    margin-bottom: 8px;
  }

  .section-title {
    font-size: 10px;
    font-weight: 800;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 5px;
    padding-bottom: 3px;
    border-bottom: 2px solid #1e3a5f;
  }

  .field {
    background: #f1f5f9;
    border-radius: 5px;
    padding: 6px 8px;
    margin-bottom: 5px;
  }

  .field-label {
    font-size: 8px;
    color: #444;
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-bottom: 2px;
    font-weight: 700;
  }

  .field-value {
    font-size: 11px;
    font-weight: 700;
    color: #111;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }

  .repay-box {
    background: #f0fdf4;
    border: 2px solid #16a34a;
    border-radius: 6px;
    padding: 8px;
    margin-bottom: 8px;
  }

  .repay-title {
    font-size: 10px;
    font-weight: 800;
    color: #14532d;
    margin-bottom: 5px;
    text-transform: uppercase;
  }

  .repay-text {
    font-size: 11px;
    color: #14532d;
    font-weight: 600;
    line-height: 1.4;
  }

  .bottom-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
  }

  .terms-box {
    background: #fff7ed;
    border: 2px solid #ea580c;
    border-radius: 6px;
    padding: 8px;
  }

  .terms-title {
    font-size: 10px;
    font-weight: 800;
    color: #9a3412;
    margin-bottom: 5px;
    text-transform: uppercase;
  }

  .terms-text {
    font-size: 10px;
    color: #7c2d12;
    line-height: 1.4;
    font-weight: 600;
  }

  .consent-box {
    background: #eff6ff;
    border: 2px solid #1e3a5f;
    border-radius: 6px;
    padding: 8px;
  }

  .consent-title {
    font-size: 10px;
    font-weight: 800;
    color: #1e3a5f;
    margin-bottom: 5px;
    text-transform: uppercase;
  }

  .consent-text {
    font-size: 10px;
    color: #1e3a5f;
    line-height: 1.4;
    font-weight: 500;
  }

  .consent-stamp {
    background: #1e3a5f;
    color: #c9a84c;
    border-radius: 5px;
    padding: 6px 8px;
    font-size: 9px;
    font-weight: 800;
    margin-top: 6px;
    text-align: center;
  }

  .footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 2px solid #e2e8f0;
    text-align: center;
    font-size: 9px;
    color: #333;
    line-height: 1.4;
    font-weight: 500;
  }

  @media (max-width: 600px) {
    .loan-grid,
    .two-col,
    .bottom-row,
    .grid-2 {
      grid-template-columns: 1fr;
    }

    .doc-title,
    .doc-date {
      text-align: left;
      margin-top: 6px;
    }

    .header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }

  @media print {
    body {
      width: 100%;
      max-width: none;
      padding: 4mm;
    }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
</style>
    </head>
    <body>

      <div class="header">
        <div class="logo-block">
          <div class="logo-circle">R</div>
          <div>
            <div class="business-name">${settings.business_name}</div>
            <div class="business-sub">Loan Management</div>
          </div>
        </div>
        <div class="doc-info">
          <div class="doc-title">Loan Agreement</div>
          <div class="doc-date">Date: ${new Date(loan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div class="doc-date">Due: ${new Date(loan.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      <div class="loan-summary">
        <div class="loan-summary-title">Loan Summary</div>
        <div class="loan-amount">₦${Number(loan.principal).toLocaleString()}</div>
        <div class="loan-grid">
          <div class="loan-item">
            <div class="loan-item-label">Total Repayment</div>
            <div class="loan-item-value">₦${Number(loan.total_owed).toLocaleString()}</div>
          </div>
          <div class="loan-item">
            <div class="loan-item-label">Interest Rate</div>
            <div class="loan-item-value">${displayRate}%</div>
          </div>
          <div class="loan-item">
            <div class="loan-item-label">Duration</div>
            <div class="loan-item-value">${displayDuration} days</div>
          </div>
          <div class="loan-item">
            <div class="loan-item-label">Interest Amount</div>
            <div class="loan-item-value">₦${Number(loan.interest_amount).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Borrower Details</div>
        <div class="grid-2">
          <div class="field">
            <div class="field-label">Full Name</div>
            <div class="field-value">${loan.applicants?.full_name}</div>
          </div>
          <div class="field">
            <div class="field-label">Phone</div>
            <div class="field-value">${loan.applicants?.phone}</div>
          </div>
          <div class="field">
            <div class="field-label">BVN</div>
            <div class="field-value">${loan.applicants?.bvn || 'N/A'}</div>
          </div>
          <div class="field">
            <div class="field-label">NIN</div>
            <div class="field-value">${loan.applicants?.nin || 'N/A'}</div>
          </div>
        </div>
        <div class="field">
          <div class="field-label">Disbursement Account</div>
          <div class="field-value">${loan.applicants?.account_name}</div>
          <div class="field-value" style="color:#444; font-size:13px;">${loan.applicants?.account_number} · ${loan.applicants?.bank_name}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Guarantor Details</div>
        <div class="grid-2">
          <div class="field">
            <div class="field-label">Full Name</div>
            <div class="field-value">${loan.guarantors?.full_name}</div>
          </div>
          <div class="field">
            <div class="field-label">Phone</div>
            <div class="field-value">${loan.guarantors?.phone}</div>
          </div>
        </div>
      </div>

      <div class="repay-box">
        <div class="repay-title">Repay To</div>
        <div class="repay-text">
          ${settings.repayment_account_name}<br>
          Bank: ${settings.repayment_bank}<br>
          Account No: <strong>${settings.repayment_account_no}</strong>
        </div>
      </div>

      <div class="terms-box">
        <div class="terms-title">⚠️ Penalty for Missed Payments</div>
        <div class="terms-text">
          If repayment is not made by the due date, an automatic new loan term is created
          at <strong>20% interest</strong> for <strong>30 days</strong>, while awaiting legal action.
          Collateral equivalent to the outstanding amount may be claimed at the time of legal action.
        </div>
      </div>

      <div class="consent-box">
        <div class="consent-title">✓ Digital Consent Declaration</div>
        <div class="consent-text">
          This loan agreement was <strong>accepted digitally</strong> by
          <strong>${loan.applicants?.full_name}</strong> on
          <strong>${new Date(loan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
          <br><br>
          By completing and submitting the online application on the ${settings.business_name} platform,
          the borrower confirmed they have read, understood, and agreed to all terms in this agreement,
          including the repayment schedule and penalty clauses.
          <br><br>
          The guarantor also confirmed their role by completing the digital guarantor form sent via the platform.
        </div>
        <div class="consent-stamp">
          ✓ DIGITALLY ACCEPTED &nbsp;·&nbsp; ${settings.business_name} &nbsp;·&nbsp;
          ${new Date(loan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      <div class="footer">
        ${settings.business_name} &nbsp;·&nbsp; ${settings.repayment_bank} &nbsp;·&nbsp; ${settings.repayment_account_no}
        <br>This is a legally binding digital loan agreement.
      </div>

      <script>window.onload = function() { window.print() }</script>
    </body>
    </html>
  `)
  win.document.close()
}
  function getStatusStyle(status) {
    const styles = {
      active: { background: '#dcfce7', color: '#16a34a' },
      overdue: { background: '#fee2e2', color: '#dc2626' },
      settled: { background: '#f1f5f9', color: '#64748b' },
      rolled_over: { background: '#ffedd5', color: '#ea580c' },
    }
    return styles[status] || { background: '#f1f5f9', color: '#64748b' }
  }

  const filteredLoans = loans.filter(l => {
    const matchesSearch = l.applicants?.full_name?.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || l.status === filter
    return matchesSearch && matchesFilter
  })
async function printLedger(loan) {
  const { data: logs } = await supabase
    .from('loan_logs')
    .select('*')
    .eq('loan_id', loan.id)
    .order('created_at', { ascending: true })

  const { data: settings } = await supabase
    .from('settings').select('*').single()

  const activityColors = {
    disbursement: '#1e3a5f',
    payment: '#16a34a',
    settled: '#16a34a',
    overdue: '#dc2626',
    rollover: '#ea580c',
  }

  const activityLabels = {
    disbursement: '🏦 Loan Disbursed',
    payment: '💳 Payment Received',
    settled: '✅ Loan Settled',
    overdue: '⚠️ Loan Overdue',
    rollover: '🔄 Loan Rolled Over',
  }

  const win = window.open('', '_blank')
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Loan Ledger - ${loan.applicants?.full_name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #1a1a1a; background: white; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-block { display: flex; align-items: center; gap: 12px; }
        .logo-circle { width: 50px; height: 50px; border-radius: 12px; background: linear-gradient(135deg, #1e3a5f, #2d5282); display: flex; align-items: center; justify-content: center; color: #c9a84c; font-size: 24px; font-weight: 900; }
        .business-name { font-size: 20px; font-weight: 900; color: #1e3a5f; }
        .doc-title { font-size: 13px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
        .doc-date { font-size: 11px; color: #64748b; margin-top: 4px; text-align: right; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 30px; }
        .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .summary-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-value { font-size: 16px; font-weight: 800; color: #1a1a1a; margin-top: 4px; }
        .loanee-section { background: linear-gradient(135deg, #1e3a5f, #2d5282); border-radius: 12px; padding: 16px; margin-bottom: 24px; color: white; }
        .loanee-name { font-size: 18px; font-weight: 900; }
        .loanee-details { font-size: 12px; opacity: 0.8; margin-top: 4px; }
        .ledger-title { font-size: 13px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
        .log-entry { display: flex; gap: 16px; margin-bottom: 16px; }
        .log-line { display: flex; flex-direction: column; align-items: center; }
        .log-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
        .log-connector { width: 2px; flex: 1; background: #e2e8f0; margin-top: 4px; }
        .log-content { flex: 1; padding-bottom: 16px; }
        .log-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
        .log-activity { font-size: 12px; font-weight: 700; }
        .log-date { font-size: 11px; color: #94a3b8; }
        .log-description { font-size: 11px; color: #64748b; line-height: 1.6; }
        .log-balance { font-size: 12px; font-weight: 700; color: #1e3a5f; margin-top: 4px; }
        .footer { margin-top: 30px; padding-top: 16px; border-top: 2px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-block">
          <div class="logo-circle"/div>
          <div>
            <div class="business-name">${settings.business_name}</div>
            <div style="font-size:11px;color:#64748b;">Loan Management</div>
          </div>
        </div>
        <div>
          <div class="doc-title">Loan Ledger</div>
          <div class="doc-date">Generated: ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      <div class="loanee-section">
        <div class="loanee-name">${loan.applicants?.full_name}</div>
        <div class="loanee-details">
          Phone: ${loan.applicants?.phone} &nbsp;|&nbsp;
          Guarantor: ${loan.guarantors?.full_name} (${loan.guarantors?.phone})
        </div>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="summary-label">Current Principal</div>
          <div class="summary-value">₦${Number(loan.principal).toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Owed</div>
          <div class="summary-value">₦${Number(loan.total_owed).toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Paid</div>
          <div class="summary-value" style="color:#16a34a;">₦${Number(loan.amount_paid).toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Outstanding</div>
          <div class="summary-value" style="color:${Number(loan.outstanding_balance) <= 0 ? '#16a34a' : '#dc2626'};">
            ₦${Number(loan.outstanding_balance).toLocaleString()}
          </div>
        </div>
      </div>

      <div class="ledger-title">Transaction History</div>

      ${logs && logs.length > 0 ? logs.map((log, index) => `
        <div class="log-entry">
          <div class="log-line">
            <div class="log-dot" style="background:${activityColors[log.activity_type] || '#94a3b8'};"></div>
            ${index < logs.length - 1 ? '<div class="log-connector"></div>' : ''}
          </div>
          <div class="log-content">
            <div class="log-header">
              <div class="log-activity" style="color:${activityColors[log.activity_type] || '#94a3b8'};">
                ${activityLabels[log.activity_type] || log.activity_type}
              </div>
              <div class="log-date">${new Date(log.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div class="log-description">${log.description}</div>
            <div class="log-balance">Balance after: ₦${Number(log.balance_after).toLocaleString()}</div>
          </div>
        </div>
      `).join('') : '<p style="color:#94a3b8;font-size:12px;">No activity logged yet.</p>'}

      <div class="footer">
        <span>${settings.business_name} · ${settings.repayment_bank} · ${settings.repayment_account_no}</span>
        <span>Status: ${loan.status.replace('_', ' ').toUpperCase()} ${loan.rollover_count > 0 ? `· Rolled Over ${loan.rollover_count}x` : ''}</span>
      </div>

      <script>window.onload = function() { window.print() }</script>
    </body>
    </html>
  `)
  win.document.close()
}
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">

        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-800">Loans</h1>
          <p className="text-gray-400 text-sm mt-1">Manage active and past loans</p>
        </div>

        {approvedApps.length > 0 && (
          <div className="rounded-2xl p-5 mb-6 border border-yellow-200" style={{ background: '#fffbeb' }}>
            <h2 className="text-sm font-bold text-yellow-800 mb-4 flex items-center gap-2">
              <span>⏳</span> Approved Applications — Awaiting Disbursement
            </h2>
            <div className="space-y-3">
              {approvedApps.map(app => (
                <div key={app.id} className="flex justify-between items-center bg-white rounded-xl p-4 shadow-sm">
                  <div>
                    <p className="font-semibold text-gray-800">{app.applicants?.full_name}</p>
                    <p className="text-sm text-gray-500">₦{Number(app.loan_amount_requested).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => createLoanFromApplication(app)}
                    disabled={disbursing === app.id}
                    className="text-white px-4 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
                  >
                    {disbursing === app.id ? 'Processing...' : 'Confirm Disbursement'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Loans list */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 rounded-full" style={{ background: '#c9a84c' }}></div>
                <h2 className="text-sm font-bold text-gray-700">All Loans</h2>
              </div>
              <input
                type="text"
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 flex-wrap">
                {['all', 'active', 'overdue', 'settled'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition"
                    style={filter === f
                      ? { background: '#1e3a5f', color: 'white' }
                      : { background: '#f1f5f9', color: '#64748b' }
                    }
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
            ) : filteredLoans.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-gray-300 text-4xl mb-2">💰</p>
                <p className="text-gray-400 text-sm">No loans found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredLoans.map(loan => (
                  <div
                    key={loan.id}
                    onClick={() => {
                      setSelectedLoan(loan)
                      fetchRollovers(loan.id)
                      setMessage('')
                    }}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selectedLoan?.id === loan.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-800 text-sm">{loan.applicants?.full_name}</p>
                          {loan.rollover_count > 0 && (
                            <span className="px-2 py-0.5 rounded-lg text-xs font-bold"
                              style={{ background: '#ffedd5', color: '#ea580c' }}>
                              🔄 Rollover x{loan.rollover_count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          ₦{Number(loan.total_owed).toLocaleString()} total · Due:{' '}
                          {new Date(loan.due_date).toLocaleDateString('en-NG', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold"
                          style={getStatusStyle(loan.status)}>
                          {loan.status.replace('_', ' ').toUpperCase()}
                        </span>
                        <p className="text-xs text-gray-400">
                          ₦{Number(loan.outstanding_balance).toLocaleString()} left
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Loan detail */}
          {selectedLoan && (
            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5 overflow-auto max-h-screen">

              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-black text-gray-800 text-lg">{selectedLoan.applicants?.full_name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-1 rounded-lg text-xs font-semibold"
                      style={getStatusStyle(selectedLoan.status)}>
                      {selectedLoan.status.replace('_', ' ').toUpperCase()}
                    </span>
                    {selectedLoan.rollover_count > 0 && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-bold"
                        style={{ background: '#ffedd5', color: '#ea580c' }}>
                        🔄 Rollover x{selectedLoan.rollover_count}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => printLoanAgreement(selectedLoan)}
                  className="text-xs px-3 py-2 rounded-xl font-semibold transition"
                  style={{ background: '#f1f5f9', color: '#1e3a5f' }}
                >
                  Print Agreement
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: '#f8fafc' }}>
                  <p className="text-xs text-gray-400">Principal</p>
                  <p className="font-bold text-gray-800">₦{Number(selectedLoan.principal).toLocaleString()}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#f8fafc' }}>
                  <p className="text-xs text-gray-400">Interest ({selectedLoan.interest_rate}%)</p>
                  <p className="font-bold text-gray-800">₦{Number(selectedLoan.interest_amount).toLocaleString()}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#f8fafc' }}>
                  <p className="text-xs text-gray-400">Total Owed</p>
                  <p className="font-bold text-gray-800">₦{Number(selectedLoan.total_owed).toLocaleString()}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#f8fafc' }}>
                  <p className="text-xs text-gray-400">Amount Paid</p>
                  <p className="font-bold text-green-600">₦{Number(selectedLoan.amount_paid).toLocaleString()}</p>
                </div>
                <div className="col-span-2 rounded-xl p-3" style={{ background: '#fff1f2' }}>
                  <p className="text-xs text-red-400">Outstanding Balance</p>
                  <p className="font-black text-red-600 text-xl">₦{Number(selectedLoan.outstanding_balance).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-400">
                  Disbursed: {new Date(selectedLoan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400">
                  Due: {new Date(selectedLoan.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400">Guarantor: {selectedLoan.guarantors?.full_name} · {selectedLoan.guarantors?.phone}</p>
              </div>

             <LoanLedger loanId={selectedLoan.id} loan={selectedLoan} onPrint={() => printLedger(selectedLoan)} />
              {/* Rollover history */}
              {rollovers.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <span>🔄</span> Rollover History
                  </h3>
                  <div className="space-y-2">
                    {rollovers.map(r => (
                      <div key={r.id} className="rounded-xl p-3 border border-orange-100"
                        style={{ background: '#fffbf5' }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-bold text-orange-600">Rollover #{r.rollover_number}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Previous outstanding: ₦{Number(r.previous_outstanding).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500">
                              New total: ₦{Number(r.new_total_owed).toLocaleString()} at {r.new_interest_rate}%
                            </p>
                          </div>
                          <p className="text-xs text-gray-400">
                            {new Date(r.rolled_over_at).toLocaleDateString('en-NG', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment history */}
              {selectedLoan.instalments?.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-3">Payment History</h3>
                  <div className="space-y-2">
                    {selectedLoan.instalments.map(inst => (
                      <div key={inst.id} className="flex justify-between items-center rounded-xl p-3"
                        style={{ background: '#f8fafc' }}>
                        <div>
                          <p className="text-sm font-semibold text-gray-700">₦{Number(inst.amount_paid).toLocaleString()}</p>
                          {inst.note && <p className="text-xs text-gray-400">{inst.note}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">
                            {new Date(inst.payment_date).toLocaleDateString('en-NG', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </p>
                          <button
                            onClick={() => printReceipt(selectedLoan, inst)}
                            className="text-xs font-medium mt-1"
                            style={{ color: '#1e3a5f' }}
                          >
                            Print Receipt
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Record payment */}
              {selectedLoan.status === 'active' && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">Record Payment</h3>
                  <div className="space-y-3">
                    <input
  type="text"
  placeholder="Amount e.g. 50,000"
  value={instalment.amount}
  onChange={(e) => {
    const raw = e.target.value.replace(/,/g, '')
    if (!isNaN(raw) || raw === '') {
      setInstalment({ ...instalment, amount: raw === '' ? '' : Number(raw).toLocaleString() })
    }
  }}
  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
/>
                    <input
                      type="date"
                      value={instalment.date}
                      onChange={(e) => setInstalment({ ...instalment, date: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      value={instalment.note}
                      onChange={(e) => setInstalment({ ...instalment, note: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
                    />
                    {message && (
                      <p className={`text-sm font-medium ${message.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
                        {message}
                      </p>
                    )}
                    <button
                      onClick={addInstalment}
                      disabled={adding}
                      className="w-full text-white py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
                    >
                      {adding ? 'Recording...' : 'Record Payment'}
                    </button>
                  </div>
                </div>
              )}

              {/* Rollover button */}
              {(selectedLoan.status === 'active' || selectedLoan.status === 'overdue') && selectedLoan.outstanding_balance > 0 && (
                <div className="border-t pt-4 space-y-2">
                  <button
                    onClick={() => {
                      if (window.confirm(`Roll over this loan?\n\nOutstanding: ₦${Number(selectedLoan.outstanding_balance).toLocaleString()}\nNew interest: 20%\nNew due date: 30 days from today\n\nThis will update the existing loan record.`)) {
                        handleRollover(selectedLoan)
                      }
                    }}
                    className="w-full text-white py-2 rounded-xl text-sm font-bold hover:opacity-90 transition"
                    style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
                  >
                    🔄 Roll Over Loan
                  </button>
                  {selectedLoan.guarantors?.phone && (
                    
                      <a href={getWhatsAppRolloverLink(selectedLoan)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition"
                      style={{ background: '#25d366', color: 'white' }}
                    >
                      📱 Notify Guarantor on WhatsApp
                    </a>
                  )}
                  <p className="text-xs text-gray-400 text-center">
                    Notify guarantor before or after rolling over
                  </p>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}