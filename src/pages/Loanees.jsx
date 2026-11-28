import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

export default function Loanees() {
  const [loanees, setLoanees] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [loans, setLoans] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchLoanees()
  }, [])

  async function fetchLoanees() {
    const { data } = await supabase
      .from('applicants')
      .select('*')
      .not('full_name', 'eq', 'Pending')
      .order('created_at', { ascending: false })
    if (data) setLoanees(data)
    setLoading(false)
  }

  async function fetchLoanHistory(applicantId) {
    const { data } = await supabase
      .from('loans')
      .select('*, instalments(*), loan_logs(amount,activity_type,created_at)')
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false })
    if (data) setLoans(data)
  }

  function handleSelect(loanee) {
    setSelected(loanee)
    fetchLoanHistory(loanee.id)
  }

  function getStatusBadge(status) {
    const styles = {
      active: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
      settled: 'bg-gray-100 text-gray-600',
      rolled_over: 'bg-orange-100 text-orange-700',
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
          <h1 className="text-2xl font-bold text-gray-800">Loanees</h1>
          <p className="text-gray-500 text-sm">All registered borrowers</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5 lg:gap-6">

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">All Loanees</h2>
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
            ) : loanees.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No loanees yet</div>
            ) : (
              <div className="divide-y">
                {loanees.filter(l =>
                  l.full_name.toLowerCase().includes(search.toLowerCase()) ||
                  l.phone.includes(search)
                ).map(loanee => (
                  <button
                    type="button"
                    key={loanee.id}
                    onClick={() => handleSelect(loanee)}
                    aria-pressed={selected?.id === loanee.id}
                    className={`w-full text-left p-4 cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500 transition ${selected?.id === loanee.id ? 'bg-slate-100' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{loanee.full_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{loanee.phone}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{loanee.occupation}</p>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(loanee.created_at).toLocaleDateString('en-NG', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={() => { setSelected(null); setLoans([]) }}>
              <section role="dialog" aria-modal="true" aria-label="Borrower details" onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-xl shadow-2xl overflow-y-auto p-5 sm:p-7 space-y-6" style={{ maxHeight: '94dvh' }}>
                <div className="sticky top-0 z-10 -mx-5 -mt-5 sm:-mx-7 sm:-mt-7 px-5 sm:px-7 py-4 mb-1 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Borrower profile</p><h2 className="font-bold text-slate-900 text-lg truncate">{selected.full_name}</h2><p className="text-xs text-slate-500 truncate">{selected.occupation}</p></div>
                  <button type="button" onClick={() => { setSelected(null); setLoans([]) }} className="w-9 h-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="Close borrower details">×</button>
                </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Phone</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.phone}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.email || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 sm:col-span-2">
                  <p className="text-xs text-gray-500">Address</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.address}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">BVN</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.bvn || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">NIN</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.nin || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Bank</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.bank_name || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Account Number</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.account_number || 'N/A'}</p>
                </div>
              </div>

              {loans.length > 0 && (() => {
                const originalCashDisbursed = loans.reduce((sum, loan) => {
                  const firstDisbursement = (loan.loan_logs || []).filter(log => log.activity_type === 'disbursement').sort((a,b) => new Date(a.created_at)-new Date(b.created_at))[0]
                  return sum + Number(firstDisbursement?.amount || (Number(loan.rollover_count || 0) === 0 ? loan.principal : 0))
                }, 0)
                const lifetimeRepayments = loans.reduce((sum, loan) => sum + (loan.instalments || []).reduce((paid, row) => paid + Number(row.amount_paid || 0), 0), 0)
                const outstanding = loans.filter(loan => ['active','overdue'].includes(loan.status)).reduce((sum, loan) => sum + Number(loan.outstanding_balance || 0), 0)
                const lifetimeInterest = loans.reduce((sum, loan) => {
                  const firstDisbursement = (loan.loan_logs || []).filter(log => log.activity_type === 'disbursement').sort((a,b) => new Date(a.created_at)-new Date(b.created_at))[0]
                  const originalPrincipal = Number(firstDisbursement?.amount || (Number(loan.rollover_count || 0) === 0 ? loan.principal : 0))
                  const loanRepayments = (loan.instalments || []).reduce((paid, row) => paid + Number(row.amount_paid || 0), 0)
                  return sum + Math.max(0, loanRepayments - originalPrincipal)
                }, 0)
                return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Original cash disbursed</p><p className="font-bold text-gray-800 text-sm">₦{originalCashDisbursed.toLocaleString()}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Lifetime repayments</p><p className="font-bold text-green-600 text-sm">₦{lifetimeRepayments.toLocaleString()}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Lifetime interest collected*</p><p className="font-bold text-green-700 text-sm">₦{lifetimeInterest.toLocaleString()}</p></div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Outstanding balances</p><p className="font-bold text-red-600 text-sm">₦{outstanding.toLocaleString()}</p></div>
                </div>
              })()}

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Loan History</h3>
                {loans.length === 0 ? (
                  <p className="text-sm text-gray-400">No loans found</p>
                ) : (
                  <div className="space-y-3">
                    {loans.map(loan => (
                      <div key={loan.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              ₦{Number(loan.principal).toLocaleString()}
                              <span className="text-gray-400 font-normal"> {Number(loan.rollover_count || 0) > 0 ? 'current rollover capital' : 'original principal'}</span>
                            </p>
                            <p className="text-xs text-gray-500">Current-cycle total: ₦{Number(loan.total_owed).toLocaleString()} · Current-cycle paid: ₦{Number(loan.amount_paid).toLocaleString()}</p>
                            <p className="text-xs text-gray-500">Lifetime repayments: ₦{(loan.instalments || []).reduce((sum, row) => sum + Number(row.amount_paid || 0), 0).toLocaleString()}</p>
                          </div>
                          {getStatusBadge(loan.status)}
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Outstanding: ₦{Number(loan.outstanding_balance).toLocaleString()}</span>
                          <span>
                            Due: {new Date(loan.due_date).toLocaleDateString('en-NG', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </span>
                        </div>
                        {loan.instalments?.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-gray-500 mb-2">
                              {loan.instalments.length} payment(s) recorded
                            </p>
                            {loan.instalments.map(inst => (
                              <div key={inst.id} className="flex justify-between text-xs text-gray-500">
                                <span>₦{Number(inst.amount_paid).toLocaleString()}</span>
                                <span>{new Date(inst.payment_date).toLocaleDateString('en-NG', {
                                  day: 'numeric', month: 'short', year: 'numeric'
                                })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              </section>
            </div>
          )}

        </div>
      </div>
    </MainLayout>
  )
}