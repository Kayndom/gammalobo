import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

const money = n => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cashWithdrawalTypes = ['earnings', 'bonus', 'expense']

export default function Finance() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loans, setLoans] = useState([])
  const [injections, setInjections] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [investments, setInvestments] = useState([])
  const [investorPayments, setInvestorPayments] = useState([])
  const [instalments, setInstalments] = useState([])
  const [disbursements, setDisbursements] = useState([])
  const [showCapitalForm, setShowCapitalForm] = useState(false)
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false)
  const [capitalForm, setCapitalForm] = useState({ amount: '', note: '' })
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: '', withdrawal_type: 'earnings', note: '' })

  async function load() {
    setLoading(true)
    setError('')
    const results = await Promise.all([
      supabase.from('loans').select('id,principal,outstanding_balance,status'),
      supabase.from('capital_injections').select('amount,injected_at'),
      supabase.from('profit_withdrawals').select('amount,withdrawal_type,withdrawn_at,note'),
      supabase.from('investments').select('principal,status,funded_at'),
      supabase.from('investor_payments').select('amount,payment_type,payment_date'),
      supabase.from('instalments').select('amount_paid,payment_date'),
      supabase.from('loan_logs').select('amount,created_at').eq('activity_type', 'disbursement')
    ])
    const failed = results.find(result => result.error)
    if (failed) setError(failed.error.message)
    setLoans(results[0].data || [])
    setInjections(results[1].data || [])
    setWithdrawals(results[2].data || [])
    setInvestments(results[3].data || [])
    setInvestorPayments(results[4].data || [])
    setInstalments(results[5].data || [])
    setDisbursements(results[6].data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addCapital(e) {
    e.preventDefault()
    const amount = Number(String(capitalForm.amount).replace(/,/g, ''))
    if (!(amount > 0)) return setError('Enter a valid capital amount.')
    setSaving(true); setError(''); setMessage('')
    const { error } = await supabase.from('capital_injections').insert({ amount, note: capitalForm.note })
    if (error) setError(error.message)
    else { setCapitalForm({ amount: '', note: '' }); setShowCapitalForm(false); setMessage('Owner capital injection recorded.'); await load() }
    setSaving(false)
  }

  async function addWithdrawal(e) {
    e.preventDefault()
    const amount = Number(String(withdrawalForm.amount).replace(/,/g, ''))
    if (!(amount > 0)) return setError('Enter a valid withdrawal amount.')
    setSaving(true); setError(''); setMessage('')
    const { error } = await supabase.from('profit_withdrawals').insert({ ...withdrawalForm, amount })
    if (error) setError(error.message)
    else { setWithdrawalForm({ amount: '', withdrawal_type: 'earnings', note: '' }); setShowWithdrawalForm(false); setMessage('Finance transaction recorded.'); await load() }
    setSaving(false)
  }

  const stats = useMemo(() => {
    const sum = (rows, field = 'amount') => rows.reduce((total, row) => total + Number(row[field] || 0), 0)
    const activeLoans = loans.filter(loan => ['active', 'overdue'].includes(loan.status))
    const ownerCapital = sum(injections)
    const investorFundingReceived = sum(investments.filter(item => item.funded_at && item.status !== 'cancelled'), 'principal')
    const borrowerCashReceived = sum(instalments, 'amount_paid')
    const loanCashDisbursed = sum(disbursements)
    const operatingExpenses = sum(withdrawals.filter(item => item.withdrawal_type === 'expense'))
    const ownerWithdrawals = sum(withdrawals.filter(item => ['earnings', 'bonus'].includes(item.withdrawal_type)))
    const profitMovedToCapital = sum(withdrawals.filter(item => item.withdrawal_type === 'profit_to_capital'))
    const investorPrincipalReturned = sum(investorPayments.filter(item => item.payment_type === 'principal'))
    const investorInterestPaid = sum(investorPayments.filter(item => item.payment_type === 'interest'))
    const investorPrincipalOutstanding = Math.max(0, investorFundingReceived - investorPrincipalReturned)
    const cashOutflows = operatingExpenses + ownerWithdrawals + sum(investorPayments) + loanCashDisbursed
    const cashMovementEstimate = ownerCapital + investorFundingReceived + borrowerCashReceived - cashOutflows
    return {
      ownerCapital, investorFundingReceived, borrowerCashReceived, loanCashDisbursed,
      operatingExpenses, ownerWithdrawals, profitMovedToCapital,
      investorPrincipalReturned, investorInterestPaid, investorPrincipalOutstanding,
      cashMovementEstimate, borrowerReceivables: sum(activeLoans, 'outstanding_balance'),
      activeLoanCount: activeLoans.length, cashOutflows
    }
  }, [loans, injections, withdrawals, investments, investorPayments, instalments, disbursements])

  if (loading) return <MainLayout><p className="text-gray-500">Loading financial records…</p></MainLayout>

  const cards = [
    ['Recorded net cash movement', money(stats.cashMovementEstimate), 'Estimated from recorded cash transactions; reconcile with bank balance'],
    ['Owner capital injected', money(stats.ownerCapital), 'Owner funding, not revenue'],
    ['Investor capital received', money(stats.investorFundingReceived), 'External funding and repayable liability'],
    ['Loan principal disbursed', money(stats.loanCashDisbursed), 'Actual principal cash outflow recorded at disbursement'],
    ['Borrower repayments received', money(stats.borrowerCashReceived), 'All recorded instalments; not all profit'],
    ['Outstanding borrower receivables', money(stats.borrowerReceivables), stats.activeLoanCount + ' active or overdue loans'],
    ['Investor principal outstanding', money(stats.investorPrincipalOutstanding), 'Investor funding less principal repaid'],
    ['Investor interest paid', money(stats.investorInterestPaid), 'Recorded interest payouts'],
    ['Operating expenses', money(stats.operatingExpenses), 'Expenses recorded'],
    ['Owner withdrawals', money(stats.ownerWithdrawals), 'Earnings and bonus withdrawals']
  ]

  return <MainLayout>
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><h1 className="text-2xl font-black text-gray-800">Finance</h1><p className="text-sm text-gray-500 mt-1">Capital, cash movements, lending assets and investor liabilities</p></div>
        <div className="flex gap-2">
          <button onClick={() => { setShowCapitalForm(!showCapitalForm); setShowWithdrawalForm(false) }} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm">+ Add capital</button>
          <button onClick={() => { setShowWithdrawalForm(!showWithdrawalForm); setShowCapitalForm(false) }} className="px-3 py-2 rounded-xl bg-blue-700 text-white text-sm">Record withdrawal / expense</button>
          <button onClick={load} className="px-3 py-2 rounded-xl border text-sm">Refresh</button>
        </div>
      </div>
      {message && <p className="p-3 rounded-xl bg-green-50 text-green-700 text-sm">{message}</p>}
      {error && <p className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</p>}
      {showCapitalForm && <form onSubmit={addCapital} className="bg-white rounded-2xl border p-5 grid sm:grid-cols-3 gap-3">
        <h2 className="sm:col-span-3 font-bold">Record owner capital injection</h2>
        <input required type="number" min="0.01" step="0.01" placeholder="Amount (₦)" className="border rounded-lg p-2" value={capitalForm.amount} onChange={e => setCapitalForm({ ...capitalForm, amount: e.target.value })} />
        <input placeholder="Note (optional)" className="border rounded-lg p-2" value={capitalForm.note} onChange={e => setCapitalForm({ ...capitalForm, note: e.target.value })} />
        <button disabled={saving} className="rounded-lg bg-slate-800 text-white p-2">{saving ? 'Saving…' : 'Save capital injection'}</button>
      </form>}
      {showWithdrawalForm && <form onSubmit={addWithdrawal} className="bg-white rounded-2xl border p-5 grid sm:grid-cols-4 gap-3">
        <h2 className="sm:col-span-4 font-bold">Record withdrawal or expense</h2>
        <select className="border rounded-lg p-2" value={withdrawalForm.withdrawal_type} onChange={e => setWithdrawalForm({ ...withdrawalForm, withdrawal_type: e.target.value })}>
          <option value="earnings">Monthly earnings (owner pay)</option><option value="bonus">Bonus withdrawal</option><option value="expense">Business expense</option><option value="profit_to_capital">Move profit to capital (non-cash)</option>
        </select>
        <input required type="number" min="0.01" step="0.01" placeholder="Amount (₦)" className="border rounded-lg p-2" value={withdrawalForm.amount} onChange={e => setWithdrawalForm({ ...withdrawalForm, amount: e.target.value })} />
        <input placeholder="Reason / note" className="border rounded-lg p-2" value={withdrawalForm.note} onChange={e => setWithdrawalForm({ ...withdrawalForm, note: e.target.value })} />
        <button disabled={saving} className="rounded-lg bg-blue-700 text-white p-2">{saving ? 'Saving…' : 'Record transaction'}</button>
      </form>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(([label, value, description]) => <div key={label} className="bg-white rounded-2xl border p-4"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-black text-slate-800 mt-2">{value}</p><p className="text-xs text-gray-400 mt-1">{description}</p></div>)}
      </div>
      <section className="bg-white rounded-2xl border p-5 space-y-2">
        <h2 className="font-bold text-gray-800">Accounting interpretation</h2>
        <p className="text-sm text-gray-600">Investor principal is a repayable liability, not revenue. Owner capital is funding, not profit. Principal returned to investors reduces cash and the liability; investor interest and operating expenses are costs.</p>
        <p className="text-sm text-gray-600">Moving profit to capital is an internal reclassification and is not treated as a cash outflow. Earnings and bonus withdrawals and expenses are cash outflows.</p>
        <p className="text-sm text-gray-600">Borrower repayments are shown as cash received, not profit. The current instalments table does not split principal from interest, and rollovers alter the current loan record. A reliable realised-profit figure requires a separate repayment-allocation and loan-event ledger.</p>
        <p className="text-sm text-gray-600">Net cash movement is an estimate from saved transactions, not a verified bank balance. Reconcile it against bank statements. Loan disbursement logs now record principal as cash paid out.</p>
      </section>
      <section className="bg-white rounded-2xl border p-5">
        <h2 className="font-bold text-gray-800 mb-3">Investor cash movements</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><p className="text-gray-500">Capital received</p><strong>{money(stats.investorFundingReceived)}</strong></div>
          <div><p className="text-gray-500">Principal returned</p><strong>{money(stats.investorPrincipalReturned)}</strong></div>
          <div><p className="text-gray-500">Interest paid</p><strong>{money(stats.investorInterestPaid)}</strong></div>
        </div>
        <a href="/investors" className="inline-block mt-4 text-sm font-semibold text-blue-700">Manage investors →</a>
      </section>
      <section className="bg-white rounded-2xl border p-5">
        <h2 className="font-bold text-gray-800 mb-3">Recent capital injections</h2>
        {injections.slice(0, 8).map((item, index) => <div key={item.id || index} className="flex justify-between border-b py-2 text-sm"><span>{item.note || 'Owner capital'} · {item.injected_at ? new Date(item.injected_at).toLocaleDateString('en-NG') : ''}</span><strong>{money(item.amount)}</strong></div>)}
        {!injections.length && <p className="text-sm text-gray-400">No capital injections recorded.</p>}
      </section>
      <section className="bg-white rounded-2xl border p-5">
        <h2 className="font-bold text-gray-800 mb-3">Recent withdrawals and expenses</h2>
        {withdrawals.slice(0, 8).map((item, index) => <div key={item.id || index} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{item.withdrawal_type} · {item.note || 'No note'} · {item.withdrawn_at ? new Date(item.withdrawn_at).toLocaleDateString('en-NG') : ''}</span><strong>{money(item.amount)}</strong></div>)}
        {!withdrawals.length && <p className="text-sm text-gray-400">No withdrawals or expenses recorded.</p>}
      </section>
    </div>
  </MainLayout>
}
