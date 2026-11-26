import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

const money = n => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const active = ['active', 'overdue']
export default function Finance() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loans, setLoans] = useState([])
  const [injections, setInjections] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [investments, setInvestments] = useState([])
  const [investorPayments, setInvestorPayments] = useState([])
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))

  async function load() {
    setLoading(true); setError('')
    const results = await Promise.all([
      supabase.from('loans').select('principal,interest_amount,amount_paid,outstanding_balance,status,total_owed'),
      supabase.from('capital_injections').select('amount,injected_at'),
      supabase.from('profit_withdrawals').select('amount,withdrawal_type,withdrawn_at'),
      supabase.from('investments').select('principal,status,funded_at'),
      supabase.from('investor_payments').select('amount,payment_type,payment_date')
    ])
    const failed = results.find(r => r.error)
    if (failed) setError(failed.error.message)
    setLoans(results[0].data || []); setInjections(results[1].data || [])
    setWithdrawals(results[2].data || []); setInvestments(results[3].data || [])
    setInvestorPayments(results[4].data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const sum = (rows, field='amount') => rows.reduce((s, x) => s + Number(x[field] || 0), 0)
    const activeLoans = loans.filter(l => active.includes(l.status))
    const loanPrincipalOut = sum(activeLoans, 'principal')
    const borrowerPrincipalReceived = loans.reduce((s,l) => s + Math.min(Number(l.principal || 0), Number(l.amount_paid || 0)), 0)
    const interestReceived = loans.reduce((s,l) => s + Math.max(0, Number(l.amount_paid || 0) - Number(l.principal || 0)), 0)
    const totalInvestorPrincipal = sum(investments.filter(i => i.status !== 'cancelled' && i.funded_at), 'principal')
    const investorPrincipalReturned = sum(investorPayments.filter(p => p.payment_type === 'principal'))
    const investorInterestPaid = sum(investorPayments.filter(p => p.payment_type === 'interest'))
    const expenses = sum(withdrawals.filter(w => w.withdrawal_type === 'expense'))
    const ownerDrawings = sum(withdrawals.filter(w => ['earnings','bonus'].includes(w.withdrawal_type)))
    const ownerCapital = sum(injections)
    const investorCapitalOutstanding = Math.max(0, totalInvestorPrincipal - investorPrincipalReturned)
    const cashIn = ownerCapital + sum(loans, 'amount_paid') + totalInvestorPrincipal
    const cashOut = loanPrincipalOut + sum(withdrawals) + sum(investorPayments)
    const cashEstimate = cashIn - cashOut
    const realizedNetProfit = interestReceived - expenses - investorInterestPaid
    const borrowerReceivables = sum(activeLoans, 'outstanding_balance')
    return { ownerCapital, loanPrincipalOut, borrowerPrincipalReceived, interestReceived, expenses, ownerDrawings,
      totalInvestorPrincipal, investorPrincipalReturned, investorInterestPaid, investorCapitalOutstanding,
      cashEstimate, realizedNetProfit, borrowerReceivables, activeCount: activeLoans.length }
  }, [loans,injections,withdrawals,investments,investorPayments])

  if (loading) return <MainLayout><p className="text-gray-500">Loading financial records…</p></MainLayout>
  const cards = [
    ['Estimated cash movement', money(stats.cashEstimate), 'Calculated from recorded cash flows'],
    ['Owner capital injected', money(stats.ownerCapital), 'Owner funding, excluding investors'],
    ['Loan principal outstanding', money(stats.loanPrincipalOut), stats.activeCount + ' active/overdue loans'],
    ['Borrower receivables', money(stats.borrowerReceivables), 'Contractual outstanding balances'],
    ['Investor principal outstanding', money(stats.investorCapitalOutstanding), 'External capital still repayable'],
    ['Interest actually received', money(stats.interestReceived), 'Cash collected above original principal'],
    ['Realised net interest profit', money(stats.realizedNetProfit), 'Interest received less expenses and investor interest paid'],
    ['Operating expenses', money(stats.expenses), 'Recorded business expenses']
  ]
  return <MainLayout>
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><h1 className="text-2xl font-black text-gray-800">Finance</h1><p className="text-sm text-gray-500 mt-1">Cash movements, lending capital, investor liabilities and realised returns</p></div>
        <button onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm">Refresh figures</button>
      </div>
      {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">Some financial data could not be loaded: {error}. Apply the investor database migration and verify table permissions.</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([label,value,desc]) => <div key={label} className="bg-white rounded-2xl border p-4">
          <p className="text-xs text-gray-500">{label}</p><p className="text-xl font-black text-slate-800 mt-2">{value}</p><p className="text-xs text-gray-400 mt-1">{desc}</p>
        </div>)}
      </div>
      <div className="bg-white rounded-2xl border p-5 space-y-3">
        <h2 className="font-bold text-gray-800">Financial interpretation</h2>
        <p className="text-sm text-gray-600">Investor principal is a liability, not revenue. Owner capital is funding, not profit. Investor interest paid and operating expenses reduce realised profit; returning investor principal reduces cash and the liability, not profit.</p>
        <p className="text-sm text-gray-600">These are operational cash-flow estimates from the existing application records, not audited bank balances or a full double-entry general ledger. Reconcile them against bank statements before relying on them for lending decisions.</p>
      </div>
      <div className="bg-white rounded-2xl border p-5">
        <h2 className="font-bold text-gray-800 mb-3">Investor cash movements</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><p className="text-gray-500">Capital received</p><strong>{money(stats.totalInvestorPrincipal)}</strong></div>
          <div><p className="text-gray-500">Principal returned</p><strong>{money(stats.investorPrincipalReturned)}</strong></div>
          <div><p className="text-gray-500">Interest paid</p><strong>{money(stats.investorInterestPaid)}</strong></div>
        </div>
        <a href="/investors" className="inline-block mt-4 text-sm font-semibold text-blue-700">Manage investors →</a>
      </div>
    </div>
  </MainLayout>
}
