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

  useEffect(() => { fetchAll() }, [])

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
      .from('loans').select('principal, interest_amount, amount_paid, outstanding_balance, status, total_owed')

    if (loans && injectData && withdrawData) {
      // Total capital ever injected
      const totalInjected = injectData.reduce((s, i) => s + Number(i.amount), 0)

      // Total ever withdrawn (earnings + expenses)
      const totalWithdrawn = withdrawData.reduce((s, w) => s + Number(w.amount), 0)

      // Capital currently out as active/overdue loans (principal only)
      const capitalOutAsLoans = loans
        .filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => s + Number(l.principal), 0)

      // Outstanding balance of active loans (what borrowers still owe — principal + remaining interest)
      const outstandingBalance = loans
        .filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => s + Number(l.outstanding_balance), 0)

      // Expected total repayment from active loans (principal + interest)
      const expectedRepaymentFromActive = loans
        .filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => s + Number(l.total_owed), 0)

      // Interest expected from active loans only
      const expectedInterestFromActive = loans
        .filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => s + Number(l.interest_amount), 0)

      // Total interest earned from fully settled loans
      const interestFromSettled = loans
        .filter(l => l.status === 'settled')
        .reduce((s, l) => s + Number(l.interest_amount), 0)

      // Interest earned from partial payments on active loans
      const interestFromPartialPayments = loans
        .filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => {
          const paid = Number(l.amount_paid)
          const principal = Number(l.principal)
          return s + Math.max(0, paid - principal)
        }, 0)

      // Total interest earned to date (settled + partial)
      const totalInterestEarned = interestFromSettled + interestFromPartialPayments

      // All money returned so far: settled loans (principal + interest) + partial payments
      const settledLoanReturns = loans
        .filter(l => l.status === 'settled')
        .reduce((s, l) => s + Number(l.total_owed), 0)
      const partialReturns = loans
        .filter(l => ['active', 'overdue'].includes(l.status))
        .reduce((s, l) => s + Number(l.amount_paid), 0)
      const totalReturned = settledLoanReturns + partialReturns
      const totalRepaidFromActive = partialReturns

      // Available capital = total injected + all money returned - capital still out - withdrawals
      const availableCapital = totalInjected + totalReturned - capitalOutAsLoans - totalWithdrawn

      // Net profit = interest earned - withdrawals
      const netProfit = totalInterestEarned - totalWithdrawn

      // Gross portfolio = available capital + outstanding balance (what's still owed by borrowers)
      const grossPortfolio = availableCapital + outstandingBalance

      const monthlyEarningsRate = settingsData?.monthly_earnings_rate || 10
      const suggestedMonthlyEarnings = (totalInterestEarned * monthlyEarningsRate) / 100

      setSummary({
  totalInjected,
  totalWithdrawn,
  capitalOutAsLoans,
  outstandingBalance,
  expectedRepaymentFromActive,
  expectedInterestFromActive,
  totalRepaidFromActive,
  totalInterestEarned,
  netProfit,
  availableCapital,
  grossPortfolio,
  suggestedMonthlyEarnings,
  monthlyEarningsRate,
  totalLoans: loans.length,
  settledLoans: loans.filter(l => l.status === 'settled').length,
  activeLoans: loans.filter(l => ['active', 'overdue'].includes(l.status)).length,
  returnOnCapital: totalInjected > 0 ? ((totalInterestEarned / totalInjected) * 100).toFixed(1) : 0,
})
    }
    setLoading(false)
  }

  async function addInjection() {
    if (!injectForm.amount) return
    setAddingInjection(true)
    const amount = parseFloat(injectForm.amount.replace(/,/g, ''))
    const { error } = await supabase.from('capital_injections').insert({ amount, note: injectForm.note })
    if (!error) {
  await logCapitalInjectionToSheets({ amount, note: injectForm.note, injected_at: new Date().toISOString() })
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
    const { error } = await supabase.from('profit_withdrawals').insert({
      amount, withdrawal_type: withdrawForm.type, note: withdrawForm.note,
    })
    if (!error) {
  await logWithdrawalToSheets({ amount, withdrawal_type: withdrawForm.type, note: withdrawForm.note, withdrawn_at: new Date().toISOString() })
  setMessage('Withdrawal recorded')
  setWithdrawForm({ amount: '', note: '', type: 'earnings' })
  setShowWithdrawForm(false)
  fetchAll()
}
    setAddingWithdrawal(false)
    setTimeout(() => setMessage(''), 3000)
  }

  function fmt(amount) {
    return `₦${Number(amount || 0).toLocaleString()}`
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-800">Finance</h1>
            <p className="text-gray-400 text-sm mt-1">Track your capital, loans and earnings</p>
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
              💸 Withdraw
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
              <input type="text" placeholder="Amount e.g. 500,000"
                value={injectForm.amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '')
                  if (!isNaN(raw) || raw === '') setInjectForm({ ...injectForm, amount: raw === '' ? '' : Number(raw).toLocaleString() })
                }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2" />
              <input type="text" placeholder="Note e.g. Top up funding"
                value={injectForm.note}
                onChange={(e) => setInjectForm({ ...injectForm, note: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2" />
              <div className="flex gap-2">
                <button onClick={addInjection} disabled={addingInjection}
                  className="flex-1 text-white py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
                  {addingInjection ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setShowInjectForm(false)}
                  className="px-4 py-2 rounded-xl text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showWithdrawForm && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border-2 border-purple-100">
            <h2 className="text-sm font-bold text-gray-700 mb-2">Record Withdrawal</h2>
            {summary && (
              <div className="bg-purple-50 rounded-xl p-3 mb-4 space-y-1">
                <p className="text-xs text-purple-700">Available capital: <strong>{fmt(summary.availableCapital)}</strong></p>
                <p className="text-xs text-purple-700">Total interest earned: <strong>{fmt(summary.totalInterestEarned)}</strong></p>
                <p className="text-xs text-purple-600">Suggested monthly earnings ({summary.monthlyEarningsRate}%): <strong>{fmt(summary.suggestedMonthlyEarnings)}</strong></p>
              </div>
            )}
            <div className="space-y-3">
              <select value={withdrawForm.type}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, type: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2">
                <option value="earnings">Monthly Earnings (pay yourself)</option>
                <option value="bonus">Bonus Withdrawal</option>
                <option value="expense">Business Expense</option>
                <option value="profit_to_capital">Move Profit to Capital</option>
              </select>
              <input type="text" placeholder="Amount e.g. 50,000"
                value={withdrawForm.amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '')
                  if (!isNaN(raw) || raw === '') setWithdrawForm({ ...withdrawForm, amount: raw === '' ? '' : Number(raw).toLocaleString() })
                }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2" />
              <input type="text" placeholder="Note (optional)"
                value={withdrawForm.note}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, note: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2" />
              <div className="flex gap-2">
                <button onClick={addWithdrawal} disabled={addingWithdrawal}
                  className="flex-1 text-white py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                  {addingWithdrawal ? 'Saving...' : 'Record'}
                </button>
                <button onClick={() => setShowWithdrawForm(false)}
                  className="px-4 py-2 rounded-xl text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-400">Loading...</div>
        ) : summary && (
          <>
            {/* Primary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: '#1e3a5f' }}>
                <p className="text-xs font-medium text-blue-200 mb-1">💰 Total Capital Injected</p>
                <p className="text-xl font-black text-white">{fmt(summary.totalInjected)}</p>
                <p className="text-xs text-blue-300 mt-1">ever added to business</p>
              </div>
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: '#c9a84c' }}>
                <p className="text-xs font-medium text-yellow-100 mb-1">📤 Capital Out as Loans</p>
                <p className="text-xl font-black text-white">{fmt(summary.capitalOutAsLoans)}</p>
                <p className="text-xs text-yellow-100 mt-1">{summary.activeLoans} active loan{summary.activeLoans !== 1 ? 's' : ''}</p>
              </div>
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: summary.availableCapital >= 0 ? '#16a34a' : '#dc2626' }}>
                <p className="text-xs font-medium text-green-100 mb-1">🏦 Available Capital</p>
                <p className="text-xl font-black text-white">{fmt(summary.availableCapital)}</p>
                <p className="text-xs text-green-100 mt-1">ready to lend</p>
              </div>
            </div>

            {/* Active loan repayment breakdown */}
<div className="bg-white rounded-2xl shadow-sm p-5 mb-4 border border-gray-100">
  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Active Loan Repayment Tracker</p>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
    <div className="rounded-xl p-4" style={{ background: '#f1f5f9' }}>
      <p className="text-xs font-medium text-gray-400 mb-1">📋 Expected Total</p>
      <p className="text-lg font-black text-gray-800">{fmt(summary.expectedRepaymentFromActive)}</p>
      <p className="text-xs text-gray-400 mt-1">capital + interest agreed</p>
    </div>
    <div className="rounded-xl p-4" style={{ background: '#f0fdf4' }}>
      <p className="text-xs font-medium text-gray-400 mb-1">✅ Amount Repaid</p>
      <p className="text-lg font-black" style={{ color: '#16a34a' }}>{fmt(summary.totalRepaidFromActive)}</p>
      <p className="text-xs text-gray-400 mt-1">received so far</p>
    </div>
    <div className="rounded-xl p-4" style={{ background: '#fff7ed' }}>
      <p className="text-xs font-medium text-gray-400 mb-1">⏳ Still Outstanding</p>
      <p className="text-lg font-black" style={{ color: '#ea580c' }}>{fmt(summary.outstandingBalance)}</p>
      <p className="text-xs text-gray-400 mt-1">borrowers still owe</p>
    </div>
    <div className="rounded-xl p-4" style={{ background: '#f0fdf4' }}>
      <p className="text-xs font-medium text-gray-400 mb-1">📈 Expected Interest</p>
      <p className="text-lg font-black" style={{ color: '#16a34a' }}>{fmt(summary.expectedInterestFromActive)}</p>
      <p className="text-xs text-gray-400 mt-1">profit still incoming</p>
    </div>
  </div>
  {/* Progress bar */}
  <div>
    <div className="flex justify-between text-xs text-gray-400 mb-1">
      <span>Repayment Progress</span>
      <span>{summary.expectedRepaymentFromActive > 0
        ? ((summary.totalRepaidFromActive / summary.expectedRepaymentFromActive) * 100).toFixed(1)
        : 0}%</span>
    </div>
    <div className="w-full bg-gray-100 rounded-full h-3">
      <div
        className="h-3 rounded-full transition-all"
        style={{
          background: 'linear-gradient(135deg, #16a34a, #22c55e)',
          width: `${summary.expectedRepaymentFromActive > 0
            ? Math.min(100, (summary.totalRepaidFromActive / summary.expectedRepaymentFromActive) * 100)
            : 0}%`
        }}
      />
    </div>
  </div>
</div>

            {/* Profit metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: '#16a34a' }}>
                <p className="text-xs font-medium text-green-100 mb-1">✅ Total Interest Earned</p>
                <p className="text-xl font-black text-white">{fmt(summary.totalInterestEarned)}</p>
                <p className="text-xs text-green-100 mt-1">from settled + partial payments</p>
              </div>
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: '#7c3aed' }}>
                <p className="text-xs font-medium text-purple-100 mb-1">👤 Paid to Yourself</p>
                <p className="text-xl font-black text-white">{fmt(summary.totalWithdrawn)}</p>
                <p className="text-xs text-purple-100 mt-1">total withdrawals</p>
              </div>
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: summary.netProfit >= 0 ? '#0f766e' : '#dc2626' }}>
                <p className="text-xs font-medium text-teal-100 mb-1">🏆 Net Profit Remaining</p>
                <p className="text-xl font-black text-white">{fmt(summary.netProfit)}</p>
                <p className="text-xs text-teal-100 mt-1">after your withdrawals</p>
              </div>
            </div>

            {/* Gross portfolio */}
            <div className="rounded-2xl p-5 shadow-sm mb-6 border-2" style={{ background: '#f8fafc', borderColor: '#1e3a5f' }}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">📊 Gross Portfolio Value</p>
                  <p className="text-3xl font-black" style={{ color: '#1e3a5f' }}>{fmt(summary.grossPortfolio)}</p>
                  <p className="text-xs text-gray-400 mt-1">Available capital + outstanding loan balances</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Return on Capital</p>
                  <p className="text-2xl font-black" style={{ color: '#c9a84c' }}>{summary.returnOnCapital}%</p>
                  <p className="text-xs text-gray-400">{summary.settledLoans} of {summary.totalLoans} loans settled</p>
                </div>
              </div>
            </div>

            {/* Suggested earnings */}
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-purple-800">💡 Suggested Monthly Earnings</p>
                  <p className="text-xs text-purple-600 mt-1">{summary.monthlyEarningsRate}% of total interest earned · set in Settings</p>
                </div>
                <p className="text-2xl font-black text-purple-700">{fmt(summary.suggestedMonthlyEarnings)}</p>
              </div>
            </div>

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
                          <p className="text-sm font-bold text-gray-800">{fmt(inj.amount)}</p>
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
                  <h2 className="text-sm font-bold text-gray-700">Withdrawals & Expenses</h2>
                </div>
                {withdrawals.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">No withdrawals yet</div>
                ) : (
                  <div className="divide-y">
                    {withdrawals.map(w => (
                      <div key={w.id} className="p-4 flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{fmt(w.amount)}</p>
                          <p className="text-xs font-medium mt-0.5" style={{ color: '#7c3aed' }}>{w.withdrawal_type?.replace(/_/g, ' ')}</p>
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
