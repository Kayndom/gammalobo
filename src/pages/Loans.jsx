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
  }

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
automatic new loan term at 20% interest for 30 days.

By signing below, you agree to the above terms.

Signature: ___________________    Date: ___________
    `
    const win = window.open('', '_blank')
    win.document.write(`<pre style="font-family:monospace;padding:30px;font-size:13px;">${agreement}</pre>`)
    win.print()
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
                      type="number"
                      placeholder="Amount (₦)"
                      value={instalment.amount}
                      onChange={(e) => setInstalment({ ...instalment, amount: e.target.value })}
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