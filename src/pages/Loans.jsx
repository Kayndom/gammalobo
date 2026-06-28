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
  const [search, setSearch] = useState('')

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
    const amount = parseFloat(instalment.amount)
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
    fetchLoans()
    setSelectedLoan(prev => ({
      ...prev,
      amount_paid: newAmountPaid,
      outstanding_balance: newOutstanding <= 0 ? 0 : newOutstanding,
      status: newStatus,
    }))
  }
  async function handleRollover(loan) {
    const { data: settings } = await supabase
      .from('settings').select('*').single()
    const principal = loan.outstanding_balance
    const rate = settings.penalty_interest_rate
    const interest = (principal * rate) / 100
    const total = principal + interest
    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + settings.loan_duration_days)
    const { data: newLoan, error: loanError } = await supabase
      .from('loans')
      .insert({
        application_id: loan.application_id,
        applicant_id: loan.applicant_id,
        guarantor_id: loan.guarantor_id,
        principal,
        interest_rate: rate,
        interest_amount: interest,
        total_owed: total,
        amount_paid: 0,
        outstanding_balance: total,
        loan_type: 'rollover',
        disbursed_at: now.toISOString(),
        due_date: dueDate.toISOString(),
        status: 'active',
      })
      .select()
      .single()
    if (loanError) return
    await supabase.from('loans')
      .update({ status: 'rolled_over' }).eq('id', loan.id)
    await supabase.from('rollovers').insert({
      original_loan_id: loan.id,
      new_loan_id: newLoan.id,
      carried_over_amount: principal,
      penalty_rate: rate,
    })
    setSelectedLoan(null)
    fetchLoans()
  }

  function getStatusBadge(status) {
    const styles = {
      active: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
      settled: 'bg-gray-100 text-gray-600',
      rolled_over: 'bg-orange-100 text-orange-700',
    }
    async function printReceipt(loan, payment) {
  const { data: settings } = await supabase
    .from('settings').select('*').single()

  const receipt = `
    GAMMA-LOBO ENTERPRISE
    Payment Receipt
    -------------------------
    Loanee: ${loan.applicants?.full_name}
    Amount Paid: ₦${Number(payment.amount_paid).toLocaleString()}
    Payment Date: ${new Date(payment.payment_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
    Outstanding Balance: ₦${Number(loan.outstanding_balance).toLocaleString()}
    -------------------------
    Repay to: ${settings.repayment_account_name}
    Bank: ${settings.repayment_bank}
    Account No: ${settings.repayment_account_no}
    -------------------------
    Thank you for your payment.
  `

  const win = window.open('', '_blank')
  win.document.write(`<pre style="font-family:monospace;padding:20px;">${receipt}</pre>`)
  win.print()
  async function printLoanAgreement(loan) {
  const { data: settings } = await supabase
    .from('settings').select('*').single()

  const agreement = `
    ${settings.business_name}
    LOAN AGREEMENT FORM
    =========================================
    Name: ${loan.applicants?.full_name}
    Phone: ${loan.applicants?.phone}

    Loan Amount: ₦${Number(loan.principal).toLocaleString()}
    Interest Rate: ${loan.interest_rate}%
    Duration: 30 days
    Loan Date: ${new Date(loan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
    Repayment Amount: ₦${Number(loan.total_owed).toLocaleString()}

    REPAYMENT DATE
    ${new Date(loan.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
    Amount: ₦${Number(loan.total_owed).toLocaleString()}

    LOAN PAID TO
    Account No: ${loan.applicants?.account_number}
    Account Name: ${loan.applicants?.account_name}
    Bank: ${loan.applicants?.bank_name}
    BVN: ${loan.applicants?.bvn}
    NIN: ${loan.applicants?.nin}

    Guarantor: ${loan.guarantors?.full_name}
    Guarantor Phone: ${loan.guarantors?.phone}

    REPAYABLE TO
    Account Name: ${settings.repayment_account_name}
    Bank: ${settings.repayment_bank}
    Account No: ${settings.repayment_account_no}

    PENALTY FOR MISSED PAYMENTS
    If a loan repayment is not paid within the due date, it attracts an
    automatic new loan term at 20% interest for 30 days, while
    awaiting legal action.

    By signing below, you agree to the above terms.

    Signature: ___________________    Date: ___________
  `

  const win = window.open('', '_blank')
  win.document.write(`<pre style="font-family:monospace;padding:30px;font-size:13px;">${agreement}</pre>`)
  win.print()
}
}
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Loans</h1>
          <p className="text-gray-500 text-sm">Manage active and past loans</p>
        </div>

        {approvedApps.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-yellow-800 mb-4">
              Approved Applications — Awaiting Disbursement
            </h2>
            <div className="space-y-3">
              {approvedApps.map(app => (
                <div key={app.id} className="flex justify-between items-center bg-white rounded-lg p-4 shadow-sm">
                  <div>
                    <p className="font-medium text-gray-800">{app.applicants?.full_name}</p>
                    <p className="text-sm text-gray-500">₦{Number(app.loan_amount_requested).toLocaleString()}</p>
                  </div>
                 <button
  onClick={() => createLoanFromApplication(app)}
  disabled={disbursing === app.id}
  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50"
>
  {disbursing === app.id ? 'Processing...' : 'Confirm Disbursement'}
</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
           <div className="p-4 border-b">
  <h2 className="text-sm font-semibold text-gray-700 mb-3">All Loans</h2>
  <input
    type="text"
    placeholder="Search by name..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</div>
            {loading ? (
              <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
            ) : loans.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No loans yet</div>
            ) : (
              <div className="divide-y">
               {loans.filter(l =>
  l.applicants?.full_name?.toLowerCase().includes(search.toLowerCase())
).map(loan => (
                  <div
                    key={loan.id}
                    onClick={() => setSelectedLoan(loan)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selectedLoan?.id === loan.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{loan.applicants?.full_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">₦{Number(loan.total_owed).toLocaleString()} total</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Due: {new Date(loan.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(loan.status)}
                        <p className="text-xs text-gray-500 mt-1">Outstanding: ₦{Number(loan.outstanding_balance).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedLoan && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-bold text-gray-800">{selectedLoan.applicants?.full_name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedLoan.loan_type === 'rollover' ? '⚠️ Rollover Loan' : 'Standard Loan'}
                  </p>
                </div>
                {getStatusBadge(selectedLoan.status)}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Principal</p>
                  <p className="font-semibold text-gray-800">₦{Number(selectedLoan.principal).toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Interest ({selectedLoan.interest_rate}%)</p>
                  <p className="font-semibold text-gray-800">₦{Number(selectedLoan.interest_amount).toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Owed</p>
                  <p className="font-semibold text-gray-800">₦{Number(selectedLoan.total_owed).toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Amount Paid</p>
                  <p className="font-semibold text-green-600">₦{Number(selectedLoan.amount_paid).toLocaleString()}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-red-500">Outstanding Balance</p>
                  <p className="font-bold text-red-600 text-lg">₦{Number(selectedLoan.outstanding_balance).toLocaleString()}</p>
                </div>
              </div>

              <button
  onClick={() => printLoanAgreement(selectedLoan)}
  className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
>
  Print Loan Agreement
</button>
<div className="space-y-1">
                <p className="text-xs text-gray-500">
                  Disbursed: {new Date(selectedLoan.disbursed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-500">
                  Due: {new Date(selectedLoan.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-500">Guarantor: {selectedLoan.guarantors?.full_name}</p>
              </div>

              {selectedLoan.instalments?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment History</h3>
                  <div className="space-y-2">
                    {selectedLoan.instalments.map(inst => (
  <div key={inst.id} className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
    <div>
      <p className="text-sm font-medium text-gray-700">₦{Number(inst.amount_paid).toLocaleString()}</p>
      {inst.note && <p className="text-xs text-gray-400">{inst.note}</p>}
    </div>
    <div className="text-right">
      <p className="text-xs text-gray-500">
        {new Date(inst.payment_date).toLocaleDateString('en-NG', {
          day: 'numeric', month: 'short', year: 'numeric'
        })}
      </p>
      <button
        onClick={() => printReceipt(selectedLoan, inst)}
        className="text-xs text-blue-500 hover:text-blue-700 mt-1"
      >
        Print Receipt
      </button>
    </div>
  </div>
))}
                  </div>
                </div>
              )}

              {selectedLoan.status === 'active' && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Record Payment</h3>
                  <div className="space-y-3">
                    <input
                      type="number"
                      placeholder="Amount (₦)"
                      value={instalment.amount}
                      onChange={(e) => setInstalment({ ...instalment, amount: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="date"
                      value={instalment.date}
                      onChange={(e) => setInstalment({ ...instalment, date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      value={instalment.note}
                      onChange={(e) => setInstalment({ ...instalment, note: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {message && (
                      <p className={`text-sm ${message.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
                        {message}
                      </p>
                    )}
                    <button
                      onClick={addInstalment}
                      disabled={adding}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {adding ? 'Recording...' : 'Record Payment'}
                    </button>
                  </div>
                </div>
              )}

              {selectedLoan.status === 'active' && selectedLoan.outstanding_balance > 0 && (
                <div className="border-t pt-4">
                  <button
                    onClick={() => {
                      if (window.confirm('Roll over this loan? The outstanding balance will become a new loan at 20% interest.')) {
                        handleRollover(selectedLoan)
                      }
                    }}
                    className="w-full bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition"
                  >
                    Roll Over Loan
                  </button>
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    Use this when loan is overdue and unpaid
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