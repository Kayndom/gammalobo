import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

const money = n => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const activeStatuses = ['active', 'overdue']

export default function Finance() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loans, setLoans] = useState([])
  const [injections, setInjections] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [investments, setInvestments] = useState([])
  const [investorPayments, setInvestorPayments] = useState([])
  const [instalments, setInstalments] = useState([])
  const [disbursements, setDisbursements] = useState([])

  async function load() {
    setLoading(true)
    setError('')
    const results = await Promise.all([
      supabase.from('loans').select('id,principal,outstanding_balance,status'),
      supabase.from('capital_injections').select('amount,injected_at'),
      supabase.from('profit_withdrawals').select('amount,withdrawal_type,withdrawn_at'),
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

  const stats = useMemo(() => {
    const sum = (rows, field = 'amount') => rows.reduce((total, row) => total + Number(row[field] || 0), 0)
    const activeLoans = loans.filter(loan => activeStatuses.includes(loan.status))
    const ownerCapital = sum(injections)
    const investorFundingReceived = sum(investments.filter(item => item.funded_at && item.status !== 'cancelled'), 'principal')
    const borrowerCashReceived = sum(instalments, 'amount_paid')
    const loanCashDisbursed = sum(disbursements)
    const operatingExpenses = sum(withdrawals.filter(item => item.withdrawal_type === 'expense'))
    const ownerWithdrawals = sum(withdrawals.filter(item => ['earnings', 'bonus'].includes(item.withdrawal_type)))
    const investorPrincipalReturned = sum(investorPayments.filter(item => item.payment_type === 'principal'))
    const investorInterestPaid = sum(investorPayments.filter(item => item.payment_type === 'interest'))
    const investorPrincipalOutstanding = Math.max(0, investorFundingReceived - investorPrincipalReturned)
    const cashMovementEstimate = ownerCapital + investorFundingReceived + borrowerCashReceived
      - loanCashDisbursed - sum(withdrawals) - sum(investorPayments)
    return {
      ownerCapital, investorFundingReceived, borrowerCashReceived, loanCashDisbursed,
      operatingExpenses, ownerWithdrawals, investorPrincipalReturned, investorInterestPaid,
      investorPrincipalOutstanding, cashMovementEstimate,
      borrowerReceivables: sum(activeLoans, 'outstanding_balance'),
      activeLoanCount: activeLoans.length
    }
  }, [loans, injections, withdrawals, investments, investorPayments, instalments, disbursements])

  if (loading) return <MainLayout><p className="text-gray-500">Loading financial records…</p></MainLayout>

  const cards = [
    ['Recorded net cash movement', money(stats.cashMovementEstimate), 'Estimate from recorded transactions; reconcile with bank balance'],
    ['Owner capital injected', money(stats.ownerCapital), 'Owner funding, not business revenue'],
    ['Investor capital received', money(stats.investorFundingReceived), 'External funding; recorded as a liability'],
    ['Loan principal disbursed', money(stats.loanCashDisbursed), 'From original disbursement log entries'],
    ['Borrower repayments received', money(stats.borrowerCashReceived), 'All recorded instalments, without principal/interest split'],
    ['Outstanding borrower receivables', money(stats.borrowerReceivables), stats.activeLoanCount + ' active or overdue loans'],
    ['Investor principal outstanding', money(stats.investorPrincipalOutstanding), 'Investor capital received less principal returned'],
    ['Investor interest paid', money(stats.investorInterestPaid), 'Recorded interest payouts'],
    ['Operating expenses', money(stats.operatingExpenses), 'Expenses recorded in withdrawals'],
    ['Owner withdrawals', money(stats.ownerWithdrawals), 'Earnings and bonus withdrawals']
  ]

  return <MainLayout>
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Finance</h1>
          <p className="text-sm text-gray-500 mt-1">Recorded cash movements, lending assets and investor liabilities</p>
        </div>
        <button onClick={load} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm">Refresh figures</button>
      </div>
      {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">Some financial records could not be loaded: {error}. Confirm that the investor migration has been applied and access policies are configured.</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(([label, value, description]) => <div key={label} className="bg-white rounded-2xl border p-4">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-black text-slate-800 mt-2">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{description}</p>
        </div>)}
      </div>
      <section className="bg-white rounded-2xl border p-5 space-y-2">
        <h2 className="font-bold text-gray-800">Important accounting notes</h2>
        <p className="text-sm text-gray-600">Investor principal is a repayable liability, not revenue. Owner capital is funding, not profit. Returning investor principal reduces cash and the liability; investor interest and operating expenses reduce profit.</p>
        <p className="text-sm text-gray-600">This page deliberately does not label borrower repayments as profit. The existing instalments table does not record how each repayment is allocated between principal and interest, and rollover edits the current loan balance. A reliable realised-profit figure requires a transaction ledger with explicit allocation and rollover events.</p>
        <p className="text-sm text-gray-600">Recorded net cash movement is an estimate from saved transactions, not a verified bank balance. Reconcile it against bank statements before making lending or withdrawal decisions.</p>
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
    </div>
  </MainLayout>
}
