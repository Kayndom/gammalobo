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

    const { data: disbursements } = await supabase
      .from('loan_logs')
      .select('amount')
      .eq('activity_type', 'disbursement')

    if (loans) {
      const activeLoans = loans.filter(l => l.status === 'active')
      const overdueLoans = loans.filter(l => l.status === 'overdue')
      const settledLoans = loans.filter(l => l.status === 'settled')
      const totalOutstanding = activeLoans.reduce((sum, l) => sum + Number(l.outstanding_balance), 0)
      // Count actual cash disbursement events only. A rollover is not a new cash disbursement.
      const totalDisbursed = (disbursements || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)

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
    { label: 'Active Loans', value: stats.activeLoans, tone: 'blue', note: 'Currently running' },
    { label: 'Total Outstanding', value: `₦${stats.totalOutstanding.toLocaleString()}`, tone: 'slate', note: 'Active loan balances' },
    { label: 'Overdue Loans', value: stats.overdueLoans, tone: 'red', note: 'Requires attention' },
    { label: 'Total Disbursed', value: `₦${stats.totalDisbursed.toLocaleString()}`, tone: 'plain', note: 'Actual cash disbursements' },
    { label: 'Settled Loans', value: stats.settledLoans, tone: 'plain', note: 'Fully settled' },
    { label: 'Pending Applications', value: stats.pendingApplications, tone: 'plain', note: 'Awaiting next action' },
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
      <div className="max-w-7xl mx-auto">

        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[.14em] font-semibold text-slate-500 mb-1">REGNUM VENTURES</p><h1 className="text-2xl font-bold text-slate-800">Business overview</h1><p className="text-slate-500 text-sm mt-1">A current view of your lending operations</p></div>
          <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-slate-700 animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            {overdueList.length > 0 && (
              <div className="rounded-xl p-4 sm:p-5 mb-6 border border-red-200/80 bg-red-50/70">
                <h2 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                  <span>⚠️</span> Overdue Loans ({overdueList.length})
                </h2>
                <div className="space-y-2">
                  {overdueList.map(loan => (
                    <div key={loan.id} className="flex flex-wrap gap-2 justify-between items-center bg-white border border-red-100 rounded-lg p-3 sm:p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 break-words">{loan.applicants?.full_name}</p>
                        <p className="text-xs text-gray-400">
                          Due: {new Date(loan.due_date).toLocaleDateString('en-NG', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-red-600 tabular-nums shrink-0">
                        ₦{Number(loan.outstanding_balance).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
              {statCards.map((card, i) => (
                <div key={i} className={`rounded-xl border p-5 sm:p-6 shadow-sm ${card.tone === 'red' ? 'border-red-200 bg-red-50' : card.tone === 'blue' ? 'border-slate-300 bg-slate-800 text-white' : card.tone === 'slate' ? 'border-slate-200 bg-slate-100' : 'border-slate-200 bg-white'}`}>
                  <p className={`text-xs font-semibold ${card.tone === 'blue' ? 'text-slate-300' : card.tone === 'red' ? 'text-red-700' : 'text-slate-500'}`}>{card.label}</p>
                  <p className={`text-2xl font-bold mt-2 tabular-nums ${card.tone === 'red' ? 'text-red-700' : card.tone === 'blue' ? 'text-white' : 'text-slate-800'}`}>{card.value}</p>
                  <p className={`text-xs mt-2 ${card.tone === 'blue' ? 'text-slate-300' : 'text-slate-500'}`}>{card.note}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                <div className="w-1 h-5 rounded-full bg-slate-500"></div>
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
                    <div key={loan.id} className="px-4 sm:px-6 py-4 flex flex-wrap gap-3 justify-between items-center hover:bg-slate-50 transition">
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