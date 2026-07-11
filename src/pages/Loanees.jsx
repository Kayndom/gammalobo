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
      .select('*, instalments(*)')
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">All Loanees</h2>
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <div
                    key={loanee.id}
                    onClick={() => handleSelect(loanee)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selected?.id === loanee.id ? 'bg-blue-50' : ''}`}
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
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

              <div>
                <h2 className="font-bold text-gray-800 text-lg">{selected.full_name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selected.occupation}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Phone</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.phone}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="font-medium text-gray-800 text-sm">{selected.email || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
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

              {loans.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total Borrowed</p>
                    <p className="font-bold text-gray-800 text-sm">
                      ₦{loans.reduce((sum, l) => sum + Number(l.principal), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total Repaid</p>
                    <p className="font-bold text-green-600 text-sm">
                      ₦{loans.reduce((sum, l) => sum + Number(l.amount_paid), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
  <p className="text-xs text-gray-500">Outstanding</p>
  <p className="font-bold text-red-600 text-sm">
    ₦{loans.filter(l => ['active', 'overdue'].includes(l.status)).reduce((sum, l) => sum + Number(l.outstanding_balance), 0).toLocaleString()}
  </p>
</div>
                </div>
              )}

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
                              <span className="text-gray-400 font-normal"> principal</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              Total: ₦{Number(loan.total_owed).toLocaleString()}
                            </p>
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

            </div>
          )}

        </div>
      </div>
    </MainLayout>
  )
}