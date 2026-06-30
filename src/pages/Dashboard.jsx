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

  useEffect(() => { fetchDashboardData() }, [])

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

  const statCards = [
    { label: 'Active Loans', value: stats.activeLoans, color: '#1e3a5f', text: 'white' },
    { label: 'Total Outstanding', value: `₦${stats.totalOutstanding.toLocaleString()}`, color: '#c9a84c', text: 'white' },
    { label: 'Overdue Loans', value: stats.overdueLoans, color: '#dc2626', text: 'white' },
    { label: 'Total Disbursed', value: `₦${stats.totalDisbursed.toLocaleString()}`, color: '#1e3a5f', text: 'white' },
    { label: 'Settled Loans', value: stats.settledLoans, color: '#16a34a', text: 'white' },
    { label: 'Pending Applications', value: stats.pendingApplications, color: '#d97706', text: 'white' },
  ]

  function getStatusStyle(status) {
    const styles = {
      active: { background: '#dcfce7', color: '#16a34a' },
      overdue: { background: '#fee2e2', color: '#dc2626' },
      settled: { background: '#f1f5f9', color: '#64748b' },
      rolled_over: { background: '#ffedd5', color: '#ea580c' },
    }
    return styles[status] || { background: '#f1f5f9', color: '#64748b' }
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">

        <div className="mb-8">
          <h1 className="text-2xl font-black text-gray-800">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Welcome back — here's your overview</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            {overdueList.length > 0 && (
              <div className="rounded-2xl p-5 mb-6 border border-red-200" style={{ background: '#fff5f5' }}>
                <h2 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                  <span>⚠️</span> Overdue Loans ({overdueList.length})
                </h2>
                <div className="space-y-2">
                  {overdueList.map(loan => (
                    <div key={loan.id} className="flex justify-between items-center bg-white rounded-xl p-3 shadow-sm">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{loan.applicants?.full_name}</p>
                        <p className="text-xs text-gray-400">
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
              {statCards.map((card, i) => (
                <div key={i} className="rounded-2xl p-5 shadow-sm"
                  style={{ background: card.color }}>
                  <p className="text-xs font-medium opacity-80" style={{ color: card.text }}>{card.label}</p>
                  <p className="text-2xl font-black mt-2" style={{ color: card.text }}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b flex items-center gap-3">
                <div className="w-1 h-5 rounded-full" style={{ background: '#c9a84c' }}></div>
                <h2 className="text-sm font-bold text-gray-700">Recent Loans</h2>
              </div>
              {recentLoans.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-gray-300 text-4xl mb-2">💰</p>
                  <p className="text-gray-400 text-sm">No loans yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {recentLoans.map(loan => (
                    <div key={loan.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{loan.applicants?.full_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          ₦{Number(loan.principal).toLocaleString()} · Due:{' '}
                          {new Date(loan.due_date).toLocaleDateString('en-NG', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold"
                          style={getStatusStyle(loan.status)}>
                          {loan.status.replace('_', ' ').toUpperCase()}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">
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