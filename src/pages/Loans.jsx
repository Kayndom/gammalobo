import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

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
    const rate = settings.standard_interest_rate
    const interest = (principal * rate) / 100
    const total = principal + interest
    const disbursedAt = new Date()
    const dueDate = new Date(disbursedAt)
    dueDate.setDate(dueDate.getDate() + settings.loan_duration_days)
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
    if (!error) fetchLoans()
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

    setSelectedLoan(null)
    setRollovers([])
    fetchLoans()
  }

  function getWhatsAppRolloverLink(loan) {
  const rawPhone = loan.guarantors?.phone || ''
  const phone = rawPhone.startsWith('0') ? '234' + rawPhone.slice(1) : rawPhone
  const message = `Hello ${loan.guarantors?.full_name}, this is to notify you that the loan for ${loan.applicants?.full_name} on Gamma-lobo Enterprise has been rolled over due to non-payment. A new loan term of 30 days has started at 20% interest. Outstanding amount: ₦${Number(loan.outstanding_balance).toLocaleString()}. You remain the guarantor for this loan.`
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; color: #1a1a1a; background: white; display: flex; justify-content: center; padding: 40px; }
        .receipt { width: 400px; border: 2px solid #1e3a5f; border-radius: 16px; overflow: hidden; }
        .receipt-header { background: linear-gradient(135deg, #1e3a5f, #2d5282); padding: 24px; text-align: center; }
        .logo-circle { width: 48px; height: 48px; border-radius: 10px; background: rgba(201,168,76,0.2); border: 2px solid #c9a84c; display: flex; align-items: center; justify-content: center; color: #c9a84c; font-size: 22px; font-weight: 900; margin: 0 auto 10px; }
        .receipt-title { color: white; font-size: 18px; font-weight: 900; }
        .receipt-sub { color: rgba(255,255,255,0.7); font-size: 11px; margin-top: 4px; }
        .receipt-body { padding: 24px; }
        .receipt-no { text-align: center; background: #f8fafc; border-radius: 8px; padding: 8px; margin-bottom: 20px; font-size: 11px; color: #64748b; font-weight: 600; letter-spacing: 1px; }
        .amount-box { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 2px solid #86efac; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 20px; }
        .amount-label { font-size: 11px; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
        .amount-value { font-size: 32px; font-weight: 900; color: #15803d; margin-top: 4px; }
        .row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed #e2e8f0; }
        .row:last-child { border-bottom: none; }
        .row-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .row-value { font-size: 12px; font-weight: 600; color: #1a1a1a; text-align: right; max-width: 60%; }
        .outstanding-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
        .outstanding-label { font-size: 11px; color: #c2410c; font-weight: 700; text-transform: uppercase; }
        .outstanding-value { font-size: 16px; font-weight: 900; color: #c2410c; }
        .repay-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px; margin-top: 12px; }
        .repay-title { font-size: 10px; color: #0369a1; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .repay-text { font-size: 11px; color: #0c4a6e; font-weight: 600; line-height: 1.6; }
        .receipt-footer { background: #f8fafc; padding: 16px; text-align: center; border-top: 2px dashed #e2e8f0; margin-top: 16px; }
        .footer-text { font-size: 11px; color: #64748b; }
        .footer-bold { font-size: 12px; font-weight: 700; color: #1e3a5f; margin-top: 4px; }
        @media print { body { padding: 0; } .receipt { border: none; } }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="receipt-header">
          <div class="logo-circle">G</div>
          <div class="receipt-title">${settings.business_name}</div>
          <div class="receipt-sub">Payment Receipt</div>
        </div>

        <div class="receipt-body">
          <div class="receipt-no">RECEIPT NO: ${receiptNo}</div>

          <div class="amount-box">
            <div class="amount-label">Amount Paid</div>
            <div class="amount-value">₦${Number(payment.amount_paid).toLocaleString()}</div>
          </div>

          <div class="row">
            <div class="row-label">Borrower</div>
            <div class="row-value">${loan.applicants?.full_name}</div>
          </div>
          <div class="row">
            <div class="row-label">Phone</div>
            <div class="row-value">${loan.applicants?.phone}</div>
          </div>
          <div class="row">
            <div class="row-label">Payment Date</div>
            <div class="row-value">${new Date(payment.payment_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <div class="row">
            <div class="row-label">Loan Total</div>
            <div class="row-value">₦${Number(loan.total_owed).toLocaleString()}</div>
          </div>
          <div class="row">
            <div class="row-label">Total Paid</div>
            <div class="row-value">₦${Number(loan.amount_paid).toLocaleString()}</div>
          </div>
          ${payment.note ? `
          <div class="row">
            <div class="row-label">Note</div>
            <div class="row-value">${payment.note}</div>
          </div>` : ''}

          <div class="outstanding-box">
            <div class="outstanding-label">Outstanding Balance</div>
            <div class="outstanding-value">₦${Number(loan.outstanding_balance).toLocaleString()}</div>
          </div>

          ${Number(loan.outstanding_balance) <= 0 ? `
<div class="repay-box" style="background: #f0fdf4; border-color: #86efac;">
  <div class="repay-title" style="color: #16a34a;">🎉 Loan Fully Repaid</div>
  <div class="repay-text" style="color: #15803d;">Congratulations! This loan has been completely settled. Thank you for your prompt repayment.</div>
</div>` : `
<div class="repay-box">
  <div class="repay-title">Repay Remaining Balance To</div>
  <div class="repay-text">${settings.repayment_account_name}</div>
  <div class="repay-text">${settings.repayment_bank} · ${settings.repayment_account_no}</div>
</div>`}

        <div class="receipt-footer">
          <div class="footer-text">Thank you for your payment</div>
          <div class="footer-bold">${settings.business_name}</div>
          <div class="footer-text" style="margin-top:4px; font-size:10px;">Generated: ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
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

  const win = window.open('', '_blank')
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Loan Agreement - ${loan.applicants?.full_name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; color: #1a1a1a; background: white; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-block { display: flex; align-items: center; gap: 12px; }
        .logo-circle { width: 50px; height: 50px; border-radius: 12px; background: linear-gradient(135deg, #1e3a5f, #2d5282); display: flex; align-items: center; justify-content: center; color: #c9a84c; font-size: 24px; font-weight: 900; }
        .business-name { font-size: 20px; font-weight: 900; color: #1e3a5f; }
        .business-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
        .doc-info { text-align: right; }
        .doc-title { font-size: 13px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; }
        .doc-date { font-size: 11px; color: #64748b; margin-top: 4px; }
        .section-title { font-size: 11px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
        .section { margin-bottom: 24px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
        .field-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
        .field-value { font-size: 13px; font-weight: 600; color: #1a1a1a; }
        .highlight-box { background: linear-gradient(135deg, #1e3a5f, #2d5282); border-radius: 12px; padding: 20px; color: white; margin-bottom: 24px; }
        .highlight-label { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; }
        .highlight-value { font-size: 28px; font-weight: 900; margin-top: 4px; color: #c9a84c; }
        .highlight-sub { font-size: 12px; opacity: 0.8; margin-top: 6px; }
        .terms-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
        .terms-title { font-size: 11px; font-weight: 700; color: #c2410c; margin-bottom: 8px; text-transform: uppercase; }
        .terms-text { font-size: 11px; color: #7c2d12; line-height: 1.6; }
        .repay-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
        .repay-title { font-size: 11px; font-weight: 700; color: #166534; margin-bottom: 8px; text-transform: uppercase; }
        .repay-text { font-size: 12px; color: #166534; font-weight: 600; }
        .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 40px; }
        .sig-line { border-top: 2px solid #1e3a5f; padding-top: 8px; }
        .sig-label { font-size: 11px; color: #64748b; }
        .sig-name { font-size: 12px; font-weight: 600; color: #1a1a1a; margin-top: 2px; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-block">
          <div class="logo-circle">G</div>
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

      <div class="highlight-box">
        <div class="highlight-label">Loan Amount</div>
        <div class="highlight-value">₦${Number(loan.principal).toLocaleString()}</div>
        <div class="highlight-sub">Total Repayment: ₦${Number(loan.total_owed).toLocaleString()} · Interest: ${loan.interest_rate}% · Duration: 30 days</div>
      </div>

      <div class="section">
        <div class="section-title">Borrower Details</div>
        <div class="grid-2">
          <div class="field">
            <div class="field-label">Full Name</div>
            <div class="field-value">${loan.applicants?.full_name}</div>
          </div>
          <div class="field">
            <div class="field-label">Phone Number</div>
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
          <div class="field" style="grid-column: span 2">
            <div class="field-label">Disbursement Account</div>
            <div class="field-value">${loan.applicants?.account_name} · ${loan.applicants?.account_number} · ${loan.applicants?.bank_name}</div>
          </div>
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
            <div class="field-label">Phone Number</div>
            <div class="field-value">${loan.guarantors?.phone}</div>
          </div>
        </div>
      </div>

      <div class="repay-box">
        <div class="repay-title">Repayment Details</div>
        <div class="repay-text">Account Name: ${settings.repayment_account_name}</div>
        <div class="repay-text">Bank: ${settings.repayment_bank}</div>
        <div class="repay-text">Account Number: ${settings.repayment_account_no}</div>
      </div>

      <div class="terms-box">
        <div class="terms-title">Penalty for Missed Payments</div>
        <div class="terms-text">
          If a loan repayment is not paid within the specified due date, it will attract an automatic new loan term 
          in which the repayment amount becomes the new loan amount with a 30-day duration at 20% interest rate, 
          while awaiting legal action. For every missed payment, 20% interest will be added with a duration of 30 days. 
          Collateral equivalent to the missed repayment amount may be claimed at the time of legal action.
        </div>
      </div>

      <div class="terms-box" style="background: #f8fafc; border-color: #e2e8f0;">
        <div class="terms-title" style="color: #1e3a5f;">Agreement</div>
        <div class="terms-text" style="color: #475569;">
          By signing below, I confirm that I have read, understood, and agreed to the terms and conditions of this loan agreement.
        </div>
      </div>

      <div class="signature-grid">
        <div>
          <div class="sig-line"></div>
          <div class="sig-label">Borrower's Signature</div>
          <div class="sig-name">${loan.applicants?.full_name}</div>
        </div>
        <div>
          <div class="sig-line"></div>
          <div class="sig-label">Guarantor's Signature</div>
          <div class="sig-name">${loan.guarantors?.full_name}</div>
        </div>
        <div>
          <div class="sig-line"></div>
          <div class="sig-label">Lender's Signature</div>
          <div class="sig-name">${settings.business_name}</div>
        </div>
        <div>
          <div class="sig-line"></div>
          <div class="sig-label">Date</div>
          <div class="sig-name">&nbsp;</div>
        </div>
      </div>

      <div class="footer">
        ${settings.business_name} · ${settings.repayment_bank} · ${settings.repayment_account_no} · This is a legally binding document.
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