import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [stats, setStats] = useState({
    activeLoans: 0,
    totalOutstanding: 0,
    overdueLoans: 0,
    totalDisbursed: 0,
    settledLoans: 0,
    pendingApplications: 0,
  })
  const [recentLoans, setRecentLoans] = useState([])
  const [overdueList, setOverdueList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    await supabase.rpc('check_overdue_loans')

    const { data: loans } = await supabase
      .from('loans')
      .select('*, applicants(*)')
      .order('created_at', { ascending: false })

    const { data: applications } = await supabase
      .from('applications')
      .select('*')
      .in('status', ['pending_loanee', 'pending_guarantor', 'pending_review'])

    if (loans) {
      const activeLoans = loans.filter(l => l.status === 'active')
      const overdueLoans = loans.filter(l => l.status === 'overdue')
      const settledLoans = loans.filter(l => l.status === 'settled')
      const totalOutstanding = activeLoans.reduce((sum, l) => sum + Number(l.outstanding_balance), 0)
      const totalDisbursed = loans.reduce((sum, l) => sum + Number(l.principal), 0)

      setStats({
        activeLoans: activeLoans.length,
        totalOutstanding,
        overdueLoans: overdueLoans.length,
        totalDisbursed,
        settledLoans: settledLoans.length,
        pendingApplications: applications?.length || 0,
      })

      setOverdueList(overdueLoans)
      setRecentLoans(loans.slice(0, 5))
    }

    setLoading(false)
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
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm">Welcome back — here's your overview</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 text-sm py-10">Loading...</div>
        ) : (
          <>
            {overdueList.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
                <h2 className="text-sm font-semibold text-red-700 mb-3">
                  ⚠️ Overdue Loans ({overdueList.length})
                </h2>
                <div className="space-y-2">
                  {overdueList.map(loan => (
                    <div key={loan.id} className="flex justify-between items-center bg-white rounded-lg p-3 shadow-sm">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{loan.applicants?.full_name}</p>
                        <p className="text-xs text-gray-500">
                          Due: {new Date(loan.due_date).toLocaleDateString('en-NG', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-red-600">
                        ₦{Number(loan.outstanding_balance).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-gray-500 text-xs">Active Loans</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{stats.activeLoans}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-gray-500 text-xs">Total Outstanding</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  ₦{stats.totalOutstanding.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-gray-500 text-xs">Overdue Loans</p>
                <p className="text-3xl font-bold text-red-500 mt-1">{stats.overdueLoans}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-gray-500 text-xs">Total Disbursed</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  ₦{stats.totalDisbursed.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-gray-500 text-xs">Settled Loans</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.settledLoans}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-gray-500 text-xs">Pending Applications</p>
                <p className="text-3xl font-bold text-yellow-500 mt-1">{stats.pendingApplications}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 border-b">
                <h2 className="text-sm font-semibold text-gray-700">Recent Loans</h2>
              </div>
              {recentLoans.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">No loans yet</div>
              ) : (
                <div className="divide-y">
                  {recentLoans.map(loan => (
                    <div key={loan.id} className="p-4 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">
                          {loan.applicants?.full_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          ₦{Number(loan.principal).toLocaleString()} — Due:{' '}
                          {new Date(loan.due_date).toLocaleDateString('en-NG', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(loan.status)}
                        <p className="text-xs text-gray-500 mt-1">
                          ₦{Number(loan.outstanding_balance).toLocaleString()} left
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </MainLayout>
  )
}