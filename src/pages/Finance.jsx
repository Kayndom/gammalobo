import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

export default function Finance() {
  const [summary, setSummary] = useState(null)
  const [injections, setInjections] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  const [injectForm, setInjectForm] = useState({ amount: '', note: '' })
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', note: '', type: 'earnings' })
  const [addingInjection, setAddingInjection] = useState(false)
  const [addingWithdrawal, setAddingWithdrawal] = useState(false)
  const [showInjectForm, setShowInjectForm] = useState(false)
  const [showWithdrawForm, setShowWithdrawForm] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    const { data: settingsData } = await supabase.from('settings').select('*').single()
    if (settingsData) setSettings(settingsData)

    const { data: injectData } = await supabase
      .from('capital_injections').select('*').order('injected_at', { ascending: false })
    if (injectData) setInjections(injectData)

    const { data: withdrawData } = await supabase
      .from('profit_withdrawals').select('*').order('withdrawn_at', { ascending: false })
    if (withdrawData) setWithdrawals(withdrawData)

    const { data: loans } = await supabase
      .from('loans').select('principal, interest_amount, amount_paid, outstanding_balance, status, loan_type')

    if (loans && injectData && withdrawData) {
      const totalInjected = injectData.reduce((s, i) => s + Number(i.amount), 0)
      const totalWithdrawn = withdrawData.reduce((s, w) => s + Number(w.amount), 0)
      const activeFloat = loans.filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => s + Number(l.outstanding_balance), 0)
      const totalInterestEarned = loans
        .filter(l => l.status === 'settled')
        .reduce((s, l) => s + Number(l.interest_amount), 0)
      const partialInterestEarned = loans
        .filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => {
          const paid = Number(l.amount_paid)
          const principal = Number(l.principal)
          const interestPaid = Math.max(0, paid - principal)
          return s + interestPaid
        }, 0)
      const totalProfit = totalInterestEarned + partialInterestEarned
      const netProfit = totalProfit - totalWithdrawn
      const availableCapital = totalInjected + netProfit - activeFloat
      const monthlyEarningsRate = settingsData?.monthly_earnings_rate || 10
      const suggestedMonthlyEarnings = (totalProfit * monthlyEarningsRate) / 100

      setSummary({
        totalInjected,
        totalWithdrawn,
        activeFloat,
        totalProfit,
        netProfit,
        availableCapital,
        suggestedMonthlyEarnings,
        monthlyEarningsRate,
        totalLoans: loans.length,
        settledLoans: loans.filter(l => l.status === 'settled').length,
        returnOnCapital: totalInjected > 0 ? ((totalProfit / totalInjected) * 100).toFixed(1) : 0,
      })
    }
    setLoading(false)
  }

  async function addInjection() {
    if (!injectForm.amount) return
    setAddingInjection(true)
    const amount = parseFloat(injectForm.amount.replace(/,/g, ''))
    const { error } = await supabase.from('capital_injections').insert({
      amount,
      note: injectForm.note,
    })
    if (!error) {
      setMessage('Capital injection recorded')
      setInjectForm({ amount: '', note: '' })
      setShowInjectForm(false)
      fetchAll()
    }
    setAddingInjection(false)
    setTimeout(() => setMessage(''), 3000)
  }

  async function addWithdrawal() {
    if (!withdrawForm.amount) return
    setAddingWithdrawal(true)
    const amount = parseFloat(withdrawForm.amount.replace(/,/g, ''))
    if (amount > (summary?.netProfit || 0)) {
      setMessage('Warning: Withdrawal exceeds available profit')
    }
    const { error } = await supabase.from('profit_withdrawals').insert({
      amount,
      withdrawal_type: withdrawForm.type,
      note: withdrawForm.note,
    })
    if (!error) {
      setMessage('Withdrawal recorded')
      setWithdrawForm({ amount: '', note: '', type: 'earnings' })
      setShowWithdrawForm(false)
      fetchAll()
    }
    setAddingWithdrawal(false)
    setTimeout(() => setMessage(''), 3000)
  }

  function formatAmount(amount) {
    return `₦${Number(amount || 0).toLocaleString()}`
  }

  const statCards = summary ? [
    { label: 'Total Capital Injected', value: formatAmount(summary.totalInjected), color: '#1e3a5f', text: 'white', icon: '💰' },
    { label: 'Currently Out as Loans', value: formatAmount(summary.activeFloat), color: '#c9a84c', text: 'white', icon: '📤' },
    { label: 'Available Capital', value: formatAmount(summary.availableCapital), color: summary.availableCapital >= 0 ? '#16a34a' : '#dc2626', text: 'white', icon: '🏦' },
    { label: 'Total Profit Earned', value: formatAmount(summary.totalProfit), color: '#16a34a', text: 'white', icon: '📈' },
    { label: 'Paid to Yourself', value: formatAmount(summary.totalWithdrawn), color: '#7c3aed', text: 'white', icon: '👤' },
    { label: 'Net Profit Remaining', value: formatAmount(summary.netProfit), color: summary.netProfit >= 0 ? '#16a34a' : '#dc2626', text: 'white', icon: '✅' },
  ] : []

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-800">Finance</h1>
            <p className="text-gray-400 text-sm mt-1">Track your capital, profit and earnings</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowInjectForm(true); setShowWithdrawForm(false) }}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 transition"
              style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
            >
              + Add Capital
            </button>
            <button
              onClick={() => { setShowWithdrawForm(true); setShowInjectForm(false) }}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 transition"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
            >
              💸 Withdraw Earnings
            </button>
          </div>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4">
            <p className="text-green-700 text-sm font-medium">{message}</p>
          </div>
        )}

        {showInjectForm && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border-2 border-blue-100">
            <h2 className="text-sm font-bold text-gray-700 mb-4">Record Capital Injection</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Amount e.g. 500,000"
                value={injectForm.amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '')
                  if (!isNaN(raw) || raw === '') {
                    setInjectForm({ ...injectForm, amount: raw === '' ? '' : Number(raw).toLocaleString() })
                  }
                }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
              />
              <input
                type="text"
                placeholder="Note e.g. Initial capital, Top up"
                value={injectForm.note}
                onChange={(e) => setInjectForm({ ...injectForm, note: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
              />
              <div className="flex gap-2">
                <button onClick={addInjection} disabled={addingInjection}
                  className="flex-1 text-white py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
                  {addingInjection ? 'Saving...' : 'Save Injection'}
                </button>
                <button onClick={() => setShowInjectForm(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showWithdrawForm && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border-2 border-purple-100">
            <h2 className="text-sm font-bold text-gray-700 mb-2">Record Earnings Withdrawal</h2>
            {summary && (
              <div className="bg-purple-50 rounded-xl p-3 mb-4">
                <p className="text-xs text-purple-700">Available profit: <strong>{formatAmount(summary.netProfit)}</strong></p>
                <p className="text-xs text-purple-600">Suggested monthly earnings ({summary.monthlyEarningsRate}%): <strong>{formatAmount(summary.suggestedMonthlyEarnings)}</strong></p>
              </div>
            )}
            <div className="space-y-3">
              <select
                value={withdrawForm.type}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, type: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
              >
                <option value="earnings">Monthly Earnings</option>
                <option value="bonus">Bonus Withdrawal</option>
                <option value="expense">Business Expense</option>
                <option value="profit_to_capital">Move Profit to Capital</option>
              </select>
              <input
                type="text"
                placeholder="Amount e.g. 50,000"
                value={withdrawForm.amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '')
                  if (!isNaN(raw) || raw === '') {
                    setWithdrawForm({ ...withdrawForm, amount: raw === '' ? '' : Number(raw).toLocaleString() })
                  }
                }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={withdrawForm.note}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, note: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2"
              />
              <div className="flex gap-2">
                <button onClick={addWithdrawal} disabled={addingWithdrawal}
                  className="flex-1 text-white py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                  {addingWithdrawal ? 'Saving...' : 'Record Withdrawal'}
                </button>
                <button onClick={() => setShowWithdrawForm(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-400">Loading...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {statCards.map((card, i) => (
                <div key={i} className="rounded-2xl p-5 shadow-sm" style={{ background: card.color }}>
                  <p className="text-xs font-medium opacity-80 mb-1" style={{ color: card.text }}>{card.icon} {card.label}</p>
                  <p className="text-xl font-black" style={{ color: card.text }}>{card.value}</p>
                </div>
              ))}
            </div>

            {summary && (
              <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-gray-700">Return on Capital</p>
                    <p className="text-3xl font-black mt-1" style={{ color: '#1e3a5f' }}>{summary.returnOnCapital}%</p>
                    <p className="text-xs text-gray-400 mt-1">{summary.settledLoans} of {summary.totalLoans} loans settled</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Monthly earnings rate</p>
                    <p className="text-2xl font-black" style={{ color: '#c9a84c' }}>{summary.monthlyEarningsRate}%</p>
                    <p className="text-xs text-gray-400">of profit · set in Settings</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b flex items-center gap-3">
                  <div className="w-1 h-5 rounded-full" style={{ background: '#1e3a5f' }}></div>
                  <h2 className="text-sm font-bold text-gray-700">Capital Injections</h2>
                </div>
                {injections.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">No capital recorded yet</div>
                ) : (
                  <div className="divide-y">
                    {injections.map(inj => (
                      <div key={inj.id} className="p-4 flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-gray-800">₦{Number(inj.amount).toLocaleString()}</p>
                          {inj.note && <p className="text-xs text-gray-400 mt-0.5">{inj.note}</p>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(inj.injected_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b flex items-center gap-3">
                  <div className="w-1 h-5 rounded-full" style={{ background: '#7c3aed' }}></div>
                  <h2 className="text-sm font-bold text-gray-700">Earnings & Withdrawals</h2>
                </div>
                {withdrawals.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">No withdrawals yet</div>
                ) : (
                  <div className="divide-y">
                    {withdrawals.map(w => (
                      <div key={w.id} className="p-4 flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-gray-800">₦{Number(w.amount).toLocaleString()}</p>
                          <p className="text-xs text-purple-600 font-medium">{w.withdrawal_type?.replace(/_/g, ' ')}</p>
                          {w.note && <p className="text-xs text-gray-400 mt-0.5">{w.note}</p>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(w.withdrawn_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </div>
    </MainLayout>
  )
}