import { useEffect, useMemo, useRef, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

const money = n => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatAmountInput = value => { const raw = String(value ?? '').replace(/,/g, ''); if (!raw || !/^\d*\.?\d*$/.test(raw)) return raw; const [whole, decimal] = raw.split('.'); const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return decimal === undefined ? formatted : `${formatted}.${decimal}` }
const cashWithdrawalTypes = ['earnings', 'bonus', 'expense']

export default function Finance() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const capitalLock = useRef(false)
  const withdrawalLock = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loans, setLoans] = useState([])
  const [injections, setInjections] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [investments, setInvestments] = useState([])
  const [investorPayments, setInvestorPayments] = useState([])
  const [investorAccruals, setInvestorAccruals] = useState([])
  const [instalments, setInstalments] = useState([])
  const [disbursements, setDisbursements] = useState([])
  const [dataLoadError, setDataLoadError] = useState('')
  const [showCapitalForm, setShowCapitalForm] = useState(false)
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false)
  const [capitalForm, setCapitalForm] = useState({ amount: '', note: '' })
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: '', withdrawal_type: 'earnings', note: '' })
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerType, setLedgerType] = useState('all')
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')
  const [selectedTransactionId, setSelectedTransactionId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    const results = await Promise.all([
      supabase.from('loans').select('id,principal,total_owed,amount_paid,outstanding_balance,rollover_count,status,applicants(full_name)'),
      supabase.from('capital_injections').select('id,amount,note,injected_at'),
      supabase.from('profit_withdrawals').select('id,amount,withdrawal_type,withdrawn_at,note'),
      supabase.from('investments').select('id,investor_id,principal,status,funded_at,investors(full_name)'),
      supabase.from('investor_payments').select('id,investment_id,amount,payment_type,payment_date,investments(investors(full_name))'),
      supabase.from('investor_accruals').select('investment_id,amount'),
      supabase.from('instalments').select('id,loan_id,rollover_number,amount_paid,allocated_principal,allocated_interest,payment_date,loans(applicants(full_name))'),
      supabase.from('loan_logs').select('id,loan_id,amount,created_at,description,loans(applicants(full_name))').eq('activity_type', 'disbursement')
    ])
    const failed = results.find(result => result.error)
    if (failed) { setError(failed.error.message); setDataLoadError(failed.error.message) } else setDataLoadError('')
    setLoans(results[0].data || [])
    setInjections(results[1].data || [])
    setWithdrawals(results[2].data || [])
    setInvestments(results[3].data || [])
    setInvestorPayments(results[4].data || [])
    setInvestorAccruals(results[5].data || [])
    setInstalments(results[6].data || [])
    setDisbursements(results[7].data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addCapital(e) {
    e.preventDefault()
    if (capitalLock.current) return
    const amount = Number(String(capitalForm.amount).replace(/,/g, ''))
    if (!(amount > 0)) return setError('Enter a valid capital amount.')
    capitalLock.current = true
    setSaving(true); setError(''); setMessage('')
    try {
      const { error } = await supabase.from('capital_injections').insert({ amount, note: capitalForm.note })
      if (error) setError(error.message)
      else { setCapitalForm({ amount: '', note: '' }); setShowCapitalForm(false); setMessage('Owner capital injection recorded.'); await load() }
    } finally {
      capitalLock.current = false
      setSaving(false)
    }
  }

  async function addWithdrawal(e) {
    e.preventDefault()
    if (withdrawalLock.current) return
    const amount = Number(String(withdrawalForm.amount).replace(/,/g, ''))
    if (!(amount > 0)) return setError('Enter a valid withdrawal amount.')
    withdrawalLock.current = true
    setSaving(true); setError(''); setMessage('')
    try {
      const { error } = await supabase.from('profit_withdrawals').insert({ ...withdrawalForm, amount })
      if (error) setError(error.message)
      else { setWithdrawalForm({ amount: '', withdrawal_type: 'earnings', note: '' }); setShowWithdrawalForm(false); setMessage('Finance transaction recorded.'); await load() }
    } finally {
      withdrawalLock.current = false
      setSaving(false)
    }
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
    const investorInterestAccrued = sum(investorAccruals)
    const investorInterestOutstanding = Math.max(0, investorInterestAccrued - investorInterestPaid)
    const realisedLoanInterest = sum(instalments, 'allocated_interest')
    const cashBasisNetInterest = realisedLoanInterest - investorInterestPaid
    const cashBasisOperatingProfit = cashBasisNetInterest - operatingExpenses
    const investorPrincipalOutstanding = Math.max(0, investorFundingReceived - investorPrincipalReturned)
    const cashOutflows = operatingExpenses + ownerWithdrawals + sum(investorPayments) + loanCashDisbursed
    const cashMovementEstimate = ownerCapital + investorFundingReceived + borrowerCashReceived - cashOutflows
    return {
      ownerCapital, investorFundingReceived, borrowerCashReceived, loanCashDisbursed,
      operatingExpenses, ownerWithdrawals, profitMovedToCapital,
      investorPrincipalReturned, investorInterestPaid, investorPrincipalOutstanding,
      investorInterestAccrued, investorInterestOutstanding,
      realisedLoanInterest, cashBasisNetInterest, cashBasisOperatingProfit,
      cashMovementEstimate, borrowerReceivables: sum(activeLoans, 'outstanding_balance'),
      activeLoanCount: activeLoans.length, cashOutflows
    }
  }, [loans, injections, withdrawals, investments, investorPayments, investorAccruals, instalments, disbursements])

  if (loading) return <MainLayout><p className="text-gray-500">Loading financial records…</p></MainLayout>

  const monthStart = `${reportMonth}-01`
  const [yearPart, monthPart] = reportMonth.split('-').map(Number)
  const monthEnd = new Date(Date.UTC(yearPart, monthPart, 1)).toISOString().slice(0, 10)
  const inMonth = value => {
    if (!value) return false
    const date = String(value).slice(0, 10)
    return date >= monthStart && date < monthEnd
  }
  const sumForReport = (rows, field = 'amount') => rows.reduce((total, row) => total + Number(row[field] || 0), 0)
  const monthlyCapital = sumForReport(injections.filter(row => inMonth(row.injected_at)))
  const monthlyInvestorFunding = sumForReport(investments.filter(row => row.funded_at && row.status !== 'cancelled' && inMonth(row.funded_at)), 'principal')
  const monthlyDisbursed = sumForReport(disbursements.filter(row => inMonth(row.created_at)))
  const monthlyRepayments = sumForReport(instalments.filter(row => inMonth(row.payment_date)), 'amount_paid')
  const monthlyLoanInterest = sumForReport(instalments.filter(row => inMonth(row.payment_date)), 'allocated_interest')
  const monthlyInvestorInterestPaid = sumForReport(investorPayments.filter(row => row.payment_type === 'interest' && inMonth(row.payment_date)))
  const monthlyExpenses = sumForReport(withdrawals.filter(row => row.withdrawal_type === 'expense' && inMonth(row.withdrawn_at)))
  const monthlyOwnerWithdrawals = sumForReport(withdrawals.filter(row => ['earnings', 'bonus'].includes(row.withdrawal_type) && inMonth(row.withdrawn_at)))
  const monthlyOperatingProfit = monthlyLoanInterest - monthlyInvestorInterestPaid - monthlyExpenses
  const monthLabel = new Date(yearPart, monthPart - 1, 1).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
  const monthlyRows = [
    ['Owner capital injected', monthlyCapital, 'Owner funding; not revenue'],
    ['Investor capital received', monthlyInvestorFunding, 'External funding; repayable liability'],
    ['Loans disbursed', monthlyDisbursed, 'Principal paid out to borrowers'],
    ['Borrower repayments received', monthlyRepayments, 'Total cash received, including principal'],
    ['Loan interest collected', monthlyLoanInterest, 'Interest portion of recorded repayments'],
    ['Investor interest paid', monthlyInvestorInterestPaid, 'Investor return actually paid'],
    ['Business expenses', monthlyExpenses, 'Recorded operating expenses'],
    ['Owner withdrawals', monthlyOwnerWithdrawals, 'Earnings and bonus withdrawals'],
    ['Net cash-basis operating profit', monthlyOperatingProfit, 'Loan interest collected less investor interest paid and operating expenses']
  ]

  const transactionLedger = [
    ...injections.map(row => ({ id: 'capital-' + row.id, date: row.injected_at, type: 'Owner capital', detail: row.note || 'Owner capital injection', party: 'Business owner', amount: Number(row.amount || 0), direction: 'Inflow', reference: row.id, source: 'Owner capital record', sourceId: row.id, extra: [['Note', row.note || 'No note recorded']] })),
    ...investments.filter(row => row.funded_at && row.status !== 'cancelled').map(row => ({ id: 'funding-' + row.id, date: row.funded_at, type: 'Investor funding', detail: 'Investment funds received', party: row.investors?.full_name || 'Investor', amount: Number(row.principal || 0), direction: 'Inflow', reference: row.id, source: 'Investment agreement', sourceId: row.id, relatedHref: '/investors', extra: [['Agreement status', row.status], ['Funding confirmed', row.funded_at ? new Date(row.funded_at).toLocaleString('en-NG') : '—']] })),
    ...disbursements.map(row => ({ id: 'disbursement-' + row.id, date: row.created_at, type: 'Loan disbursement', detail: row.description || 'Loan principal disbursed', party: row.loans?.applicants?.full_name || 'Borrower', amount: Number(row.amount || 0), direction: 'Outflow', reference: row.id, source: 'Loan ledger entry', sourceId: row.id, relatedHref: '/loans', relatedLabel: 'Open loan records', extra: [['Loan reference', row.loan_id], ['Log description', row.description || 'Loan principal disbursed']] })),
    ...instalments.map(row => ({ id: 'repayment-' + row.id, date: row.payment_date, type: 'Borrower repayment', detail: 'Principal: ' + money(row.allocated_principal) + ' · Interest: ' + money(row.allocated_interest), party: row.loans?.applicants?.full_name || 'Borrower', amount: Number(row.amount_paid || 0), direction: 'Inflow', reference: row.id, source: 'Repayment record', sourceId: row.id, relatedHref: '/loans', relatedLabel: 'Open loan records', extra: [['Loan reference', row.loan_id], ['Principal allocated', money(row.allocated_principal)], ['Interest allocated', money(row.allocated_interest)]] })),
    ...investorPayments.map(row => ({ id: 'investor-payment-' + row.id, date: row.payment_date, type: row.payment_type === 'principal' ? 'Investor principal returned' : 'Investor interest paid', detail: 'Recorded investor payment', party: row.investments?.investors?.full_name || 'Investor', amount: Number(row.amount || 0), direction: 'Outflow', reference: row.id, source: 'Investor payment record', sourceId: row.id, relatedHref: '/investors', relatedLabel: 'Open investor records', extra: [['Payment category', row.payment_type]] })),
    ...withdrawals.map(row => ({ id: 'withdrawal-' + row.id, date: row.withdrawn_at, type: row.withdrawal_type === 'expense' ? 'Business expense' : row.withdrawal_type === 'profit_to_capital' ? 'Profit moved to capital' : row.withdrawal_type === 'bonus' ? 'Owner bonus' : 'Owner earnings withdrawal', detail: row.note || 'No note provided', party: row.withdrawal_type === 'expense' ? 'Business' : 'Owner', amount: Number(row.amount || 0), direction: row.withdrawal_type === 'profit_to_capital' ? 'Non-cash' : 'Outflow', reference: row.id, source: 'Withdrawal / expense record', sourceId: row.id, extra: [['Category', row.withdrawal_type], ['Note', row.note || 'No note recorded']] }))
  ].filter(row => row.date).sort((a, b) => new Date(b.date) - new Date(a.date))
  const filteredLedger = transactionLedger.filter(row => {
    const date = String(row.date).slice(0, 10)
    const matchesType = ledgerType === 'all' || row.type === ledgerType
    const matchesFrom = !ledgerFrom || date >= ledgerFrom
    const matchesTo = !ledgerTo || date <= ledgerTo
    const term = ledgerSearch.trim().toLowerCase()
    const matchesSearch = !term || [row.type, row.detail, row.party, row.direction].join(' ').toLowerCase().includes(term)
    return matchesType && matchesFrom && matchesTo && matchesSearch
  })
  const ledgerTypes = [...new Set(transactionLedger.map(row => row.type))].sort()

  const reconciliation = (() => {
    const issues = []
    const tolerance = 0.02
    loans.forEach(loan => {
      const cycle = Number(loan.rollover_count || 0)
      const currentCyclePayments = instalments.filter(row => row.loan_id === loan.id && Number(row.rollover_number || 0) === cycle)
      const recordedPayments = currentCyclePayments.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0)
      const expectedBalance = Math.max(0, Number(loan.total_owed || 0) - Number(loan.amount_paid || 0))
      const storedBalance = Number(loan.outstanding_balance || 0)
      if (Math.abs(expectedBalance - storedBalance) > tolerance) {
        issues.push({ id: 'loan-balance-' + loan.id, area: 'Loan balance', person: loan.applicants?.full_name || 'Borrower', detail: 'Stored outstanding balance differs from total owed less payments in the current loan cycle.', expected: expectedBalance, recorded: storedBalance })
      }
      if (Math.abs(recordedPayments - Number(loan.amount_paid || 0)) > tolerance) {
        issues.push({ id: 'loan-payments-' + loan.id, area: 'Loan repayments', person: loan.applicants?.full_name || 'Borrower', detail: 'Current-cycle instalment records do not match the amount-paid figure on the loan.', expected: Number(loan.amount_paid || 0), recorded: recordedPayments })
      }
    })
    instalments.forEach(row => {
      const allocated = Number(row.allocated_principal || 0) + Number(row.allocated_interest || 0)
      if (Math.abs(Number(row.amount_paid || 0) - allocated) > tolerance) {
        issues.push({ id: 'allocation-' + row.id, area: 'Repayment allocation', person: row.loans?.applicants?.full_name || 'Borrower', detail: 'Principal plus interest allocation does not equal the repayment amount.', expected: Number(row.amount_paid || 0), recorded: allocated })
      }
    })
    investments.filter(item => item.funded_at && item.status !== 'cancelled').forEach(item => {
      const payments = investorPayments.filter(row => row.investment_id === item.id)
      const principalPaid = payments.filter(row => row.payment_type === 'principal').reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const interestPaid = payments.filter(row => row.payment_type === 'interest').reduce((sum, row) => sum + Number(row.amount || 0), 0)
      const accrued = investorAccruals.filter(row => row.investment_id === item.id).reduce((sum, row) => sum + Number(row.amount || 0), 0)
      if (principalPaid - Number(item.principal || 0) > tolerance) {
        issues.push({ id: 'investor-principal-' + item.id, area: 'Investor principal', person: item.investors?.full_name || 'Investor', detail: 'Principal repayments exceed the funded principal.', expected: Number(item.principal || 0), recorded: principalPaid })
      }
      if (interestPaid - accrued > tolerance) {
        issues.push({ id: 'investor-interest-' + item.id, area: 'Investor interest', person: item.investors?.full_name || 'Investor', detail: 'Interest payments exceed interest accrued for this agreement.', expected: accrued, recorded: interestPaid })
      }
    })
    return issues
  })()

  const cards = [
    ['Recorded net cash movement', money(stats.cashMovementEstimate), 'Estimated from recorded cash transactions; reconcile with bank balance'],
    ['Owner capital injected', money(stats.ownerCapital), 'Owner funding, not revenue'],
    ['Investor capital received', money(stats.investorFundingReceived), 'External funding and repayable liability'],
    ['Loan principal disbursed', money(stats.loanCashDisbursed), 'Actual principal cash outflow recorded at disbursement'],
    ['Borrower repayments received', money(stats.borrowerCashReceived), 'All recorded instalments; not all profit'],
    ['Loan interest actually collected', money(stats.realisedLoanInterest), 'Principal-first allocation from recorded repayments'],
    ['Cash-basis profit after investor interest and expenses', money(stats.cashBasisOperatingProfit), 'Collected loan interest less investor interest paid and operating expenses'],
    ['Outstanding borrower receivables', money(stats.borrowerReceivables), stats.activeLoanCount + ' active or overdue loans'],
    ['Investor principal outstanding', money(stats.investorPrincipalOutstanding), 'Investor funding less principal repaid'],
    ['Investor interest accrued but unpaid', money(stats.investorInterestOutstanding), 'Accrued investor returns less interest already paid'],
    ['Investor interest paid', money(stats.investorInterestPaid), 'Recorded interest payouts'],
    ['Operating expenses', money(stats.operatingExpenses), 'Expenses recorded'],
    ['Owner withdrawals', money(stats.ownerWithdrawals), 'Earnings and bonus withdrawals']
  ]

  return <MainLayout>
    <div className="max-w-6xl mx-auto space-y-6">
      <style>{`@media print { body * { visibility: hidden !important; } #monthly-financial-report, #monthly-financial-report * { visibility: visible !important; } #monthly-financial-report { position: absolute; left: 0; top: 0; width: 100%; border: 0; } }`}</style>
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><h1 className="text-2xl font-black text-gray-800">Finance</h1><p className="text-sm text-gray-500 mt-1">Capital, cash movements, lending assets and investor liabilities</p></div>
        <div className="flex gap-2">
          <button onClick={() => { setShowCapitalForm(!showCapitalForm); setShowWithdrawalForm(false) }} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm">+ Add capital</button>
          <button onClick={() => { setShowWithdrawalForm(!showWithdrawalForm); setShowCapitalForm(false) }} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm">Record withdrawal / expense</button>
          <button onClick={load} className="px-3 py-2 rounded-xl border text-sm">Refresh</button>
        </div>
      </div>
      {message && <p className="p-3 rounded-xl bg-green-50 text-green-700 text-sm">{message}</p>}
      {error && <p className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</p>}
      {showCapitalForm && <form onSubmit={addCapital} className="bg-white rounded-2xl border p-5 grid sm:grid-cols-3 gap-3">
        <h2 className="sm:col-span-3 font-bold">Record owner capital injection</h2>
        <input required type="text" inputMode="decimal" placeholder="Amount (₦)" className="border rounded-lg p-2" value={capitalForm.amount} onChange={e => setCapitalForm({ ...capitalForm, amount: formatAmountInput(e.target.value) })} />
        <input placeholder="Note (optional)" className="border rounded-lg p-2" value={capitalForm.note} onChange={e => setCapitalForm({ ...capitalForm, note: e.target.value })} />
        <button disabled={saving} className="rounded-lg bg-slate-800 text-white p-2">{saving ? 'Saving…' : 'Save capital injection'}</button>
      </form>}
      {showWithdrawalForm && <form onSubmit={addWithdrawal} className="bg-white rounded-2xl border p-5 grid sm:grid-cols-4 gap-3">
        <h2 className="sm:col-span-4 font-bold">Record withdrawal or expense</h2>
        <select className="border rounded-lg p-2" value={withdrawalForm.withdrawal_type} onChange={e => setWithdrawalForm({ ...withdrawalForm, withdrawal_type: e.target.value })}>
          <option value="earnings">Monthly earnings (owner pay)</option><option value="bonus">Bonus withdrawal</option><option value="expense">Business expense</option><option value="profit_to_capital">Move profit to capital (non-cash)</option>
        </select>
        <input required type="text" inputMode="decimal" placeholder="Amount (₦)" className="border rounded-lg p-2" value={withdrawalForm.amount} onChange={e => setWithdrawalForm({ ...withdrawalForm, amount: formatAmountInput(e.target.value) })} />
        <input placeholder="Reason / note" className="border rounded-lg p-2" value={withdrawalForm.note} onChange={e => setWithdrawalForm({ ...withdrawalForm, note: e.target.value })} />
        <button disabled={saving} className="rounded-lg bg-slate-800 text-white p-2">{saving ? 'Saving…' : 'Record transaction'}</button>
      </form>}
      <section id="monthly-financial-report" className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap justify-between items-end gap-3">
          <div><h2 className="font-bold text-gray-800">Monthly financial performance report</h2><p className="text-sm text-gray-500">A date-based summary of recorded business activity. Select any month to review or print.</p></div>
          <div className="flex flex-wrap gap-2 items-center print:hidden">
            <input aria-label="Report month" type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border rounded-lg p-2 text-sm" />
            <button onClick={() => window.print()} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm">Print / Save PDF</button>
          </div>
        </div>
        <h3 className="font-semibold text-slate-700">{monthLabel}</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {monthlyRows.map(([label, amount, description]) => <div key={label} className="rounded-xl border p-3"><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-bold text-slate-800 mt-1">{money(amount)}</p><p className="text-xs text-gray-400 mt-1">{description}</p></div>)}
        </div>
        <p className="text-xs text-gray-500">This report uses transaction dates and recorded allocations. Capital received, investor funding, loan disbursements and borrower principal repayments are cash movements, not operating profit. It is a management summary, not an audited or statutory financial statement.</p>
      </section>
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div><h2 className="font-bold text-slate-800">Financial reconciliation</h2><p className="text-sm text-gray-500 mt-1">Read-only checks of loan balances, repayment allocations and investor payment limits.</p></div>
          <button onClick={load} className="px-3 py-2 rounded-lg border text-sm">Run checks again</button>
        </div>
        {dataLoadError ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>Checks incomplete.</strong> Some financial records could not be loaded: {dataLoadError}. Refresh after resolving the data access issue.</div> : reconciliation.length === 0 ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-800">No discrepancies detected</p><p className="text-sm text-emerald-700 mt-1">The checks below found no differences in the records currently loaded. This is not a bank reconciliation or an audit.</p></div> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-semibold text-amber-900">{reconciliation.length} item(s) need review</p><p className="text-sm text-amber-800 mt-1">No records have been changed. Review each item against your original payment evidence before making any correction.</p></div>}
        {!dataLoadError && reconciliation.length > 0 && <div className="divide-y divide-slate-100">{reconciliation.map(issue => <div key={issue.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-semibold text-slate-800">{issue.area} · {issue.person}</p><p className="text-xs text-slate-500 mt-1">{issue.detail}</p></div><span className="text-xs font-semibold text-amber-700">Review required</span></div><div className="grid grid-cols-2 gap-3 mt-2 text-xs"><p className="text-slate-500">Expected <strong className="block text-slate-800 text-sm">{money(issue.expected)}</strong></p><p className="text-slate-500">Recorded <strong className="block text-slate-800 text-sm">{money(issue.recorded)}</strong></p></div></div>)}</div>}
        <p className="text-xs text-slate-400">Scope: current loan-cycle balances and repayments, repayment principal/interest allocation, and funded investor agreement payment limits. Does not compare your bank balance or cash-in-hand.</p>
      </section>
      <section className="space-y-3">
        <div><h2 className="font-bold text-gray-800">Business overview</h2><p className="text-xs text-gray-500">Your recorded cash position and the main sources and uses of funds.</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.slice(0, 5).map(([label, value, description]) => <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-black text-slate-800 mt-2">{value}</p><p className="text-xs text-gray-400 mt-1">{description}</p></div>)}
        </div>
      </section>
      <section className="space-y-3">
        <div><h2 className="font-bold text-gray-800">Lending performance</h2><p className="text-xs text-gray-500">Cash actually collected from borrowers and money still owed on active loans.</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.slice(5, 8).map(([label, value, description]) => <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-black text-slate-800 mt-2">{value}</p><p className="text-xs text-gray-400 mt-1">{description}</p></div>)}
        </div>
      </section>
      <section className="space-y-3">
        <div><h2 className="font-bold text-gray-800">Investor obligations and business costs</h2><p className="text-xs text-gray-500">Amounts owed to investors, interest paid, expenses and owner withdrawals.</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.slice(8).map(([label, value, description]) => <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-black text-slate-800 mt-2">{value}</p><p className="text-xs text-gray-400 mt-1">{description}</p></div>)}
        </div>
      </section>
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-2 shadow-sm">
        <h2 className="font-bold text-gray-800">Accounting interpretation</h2>
        <p className="text-sm text-gray-600">Investor principal is a repayable liability, not revenue. Owner capital is funding, not profit. Principal returned to investors reduces cash and the liability; investor interest and operating expenses are costs. Accrued but unpaid investor interest is shown separately from interest already paid.</p>
        <p className="text-sm text-gray-600">Moving profit to capital is an internal reclassification and is not treated as a cash outflow. Earnings and bonus withdrawals and expenses are cash outflows.</p>
        <p className="text-sm text-gray-600">New repayments are allocated principal-first, then interest, with the rollover cycle recorded separately. This allows the app to show loan interest actually collected. Older instalments without allocation data are not guessed and should be excluded from profit reporting after the fresh reset.</p>
        <p className="text-sm text-gray-600">Cash-basis operating profit is collected loan interest less investor interest actually paid and recorded operating expenses. It is not an accrual-basis statutory profit figure and does not include uncollected loan interest.</p>
        <p className="text-sm text-gray-600">Net cash movement is an estimate from saved transactions, not a verified bank balance. Reconcile it against bank statements. Loan disbursement logs now record principal as cash paid out.</p>
      </section>
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="font-bold text-gray-800 mb-3">Investor cash movements</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><p className="text-gray-500">Capital received</p><strong>{money(stats.investorFundingReceived)}</strong></div>
          <div><p className="text-gray-500">Principal returned</p><strong>{money(stats.investorPrincipalReturned)}</strong></div>
          <div><p className="text-gray-500">Interest accrued but unpaid</p><strong>{money(stats.investorInterestOutstanding)}</strong></div>
          <div><p className="text-gray-500">Interest paid</p><strong>{money(stats.investorInterestPaid)}</strong></div>
        </div>
        <a href="/investors" className="inline-block mt-4 text-sm font-semibold text-blue-700">Manage investors →</a>
      </section>
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-sm">
        <div><h2 className="font-bold text-slate-800">Financial transaction history</h2><p className="text-sm text-gray-500">Search and trace recorded cash movements across lending, investors and business expenses.</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input value={ledgerSearch} onChange={e=>setLedgerSearch(e.target.value)} placeholder="Search person, type or note" className="border rounded-lg p-2 text-sm"/>
          <select value={ledgerType} onChange={e=>setLedgerType(e.target.value)} className="border rounded-lg p-2 text-sm"><option value="all">All transaction types</option>{ledgerTypes.map(type=><option key={type} value={type}>{type}</option>)}</select>
          <label className="text-xs text-gray-500">From<input type="date" value={ledgerFrom} onChange={e=>setLedgerFrom(e.target.value)} className="block w-full border rounded-lg p-2 text-sm"/></label>
          <label className="text-xs text-gray-500">To<input type="date" value={ledgerTo} onChange={e=>setLedgerTo(e.target.value)} className="block w-full border rounded-lg p-2 text-sm"/></label>
        </div>
        <div className="flex justify-between items-center text-xs text-gray-500"><span>{filteredLedger.length} transaction(s)</span><button onClick={()=>{setLedgerSearch('');setLedgerType('all');setLedgerFrom('');setLedgerTo('')}} className="text-blue-700 font-semibold">Clear filters</button></div>
        {filteredLedger.length ? <div className="overflow-x-auto"><table className="w-full text-sm min-w-[680px]"><thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Transaction</th><th className="py-2 pr-3">Person / account</th><th className="py-2 pr-3">Details</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>{filteredLedger.map(row=><tr key={row.id} className="border-b last:border-0 align-top"><td className="py-3 pr-3 whitespace-nowrap">{new Date(row.date).toLocaleDateString("en-NG")}</td><td className="py-3 pr-3"><button onClick={()=>setSelectedTransactionId(selectedTransactionId===row.id?null:row.id)} className="text-left font-semibold text-blue-700 hover:underline">{row.type}<span className="block text-[11px] text-gray-400 font-normal">{row.direction} · View details</span></button></td><td className="py-3 pr-3">{row.party}</td><td className="py-3 pr-3 text-gray-500 max-w-xs">{row.detail}</td><td className="py-3 text-right font-semibold whitespace-nowrap">{money(row.amount)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-gray-400 py-4">No transactions match these filters.</p>}
        {selectedTransactionId && (() => { const row = transactionLedger.find(item => item.id === selectedTransactionId); if (!row) return null; return <div className="fixed inset-0 z-[60] bg-slate-950/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={() => setSelectedTransactionId(null)}><section role="dialog" aria-modal="true" aria-label="Transaction details" onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-xl shadow-2xl overflow-y-auto p-5 sm:p-7 space-y-5" style={{ maxHeight: '94dvh' }}><div className="flex justify-between items-start gap-3 border-b border-slate-200 pb-4"><div><p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Read-only transaction record</p><h3 className="font-bold text-xl text-slate-900 mt-1">{row.type}</h3></div><button type="button" onClick={() => setSelectedTransactionId(null)} aria-label="Close transaction details" className="w-9 h-9 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">×</button></div><div className="grid sm:grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500">Amount</p><p className="font-bold text-xl tabular-nums text-slate-900">{money(row.amount)}</p></div><div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><p className="text-xs text-slate-500">Date</p><p className="font-semibold mt-1">{new Date(row.date).toLocaleString("en-NG")}</p></div><div><p className="text-xs text-slate-500">Direction</p><p className="font-semibold">{row.direction}</p></div><div><p className="text-xs text-slate-500">Person / account</p><p className="font-semibold">{row.party}</p></div><div><p className="text-xs text-slate-500">Record type</p><p className="font-semibold">{row.source}</p></div><div><p className="text-xs text-slate-500">Record reference</p><p className="font-mono text-xs break-all">{row.sourceId || row.reference}</p></div></div><div className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500 mb-1">Description</p><p className="text-sm">{row.detail}</p>{(row.extra || []).map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 mt-3 pt-3 text-sm"><span className="text-slate-500">{label}</span><strong className="text-right break-all">{value}</strong></div>)}</div>{row.relatedHref && <a href={row.relatedHref} className="inline-flex text-sm font-semibold text-slate-800 underline">{row.relatedLabel || "Open related records"} →</a>}<p className="text-xs text-slate-500">This is a read-only view of the saved record. No financial data has been changed.</p></section></div> })()}
        <p className="text-xs text-gray-500">This history displays recorded transactions only. It does not create, edit or delete ledger entries. Accruals are not cash transactions and are excluded from this cash-movement history.</p>
      </section>
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="font-bold text-gray-800 mb-3">Recent capital injections</h2>
        {injections.slice(0, 8).map((item, index) => <div key={item.id || index} className="flex justify-between border-b py-2 text-sm"><span>{item.note || 'Owner capital'} · {item.injected_at ? new Date(item.injected_at).toLocaleDateString('en-NG') : ''}</span><strong>{money(item.amount)}</strong></div>)}
        {!injections.length && <p className="text-sm text-gray-400">No capital injections recorded.</p>}
      </section>
      <section className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="font-bold text-gray-800 mb-3">Recent withdrawals and expenses</h2>
        {withdrawals.slice(0, 8).map((item, index) => <div key={item.id || index} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{item.withdrawal_type} · {item.note || 'No note'} · {item.withdrawn_at ? new Date(item.withdrawn_at).toLocaleDateString('en-NG') : ''}</span><strong>{money(item.amount)}</strong></div>)}
        {!withdrawals.length && <p className="text-sm text-gray-400">No withdrawals or expenses recorded.</p>}
      </section>
    </div>
  </MainLayout>
}
