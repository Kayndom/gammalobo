import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

const fieldLabel = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const dateTime = value => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const tableLabels = {
  applications: 'application', applicants: 'borrower', guarantors: 'guarantor',
  loans: 'loan', instalments: 'loan repayment', loan_logs: 'loan activity',
  rollovers: 'loan rollover', investors: 'investor', investments: 'investment agreement',
  investor_accruals: 'investor interest accrual', investor_payments: 'investor payment',
  capital_injections: 'owner capital injection', profit_withdrawals: 'owner withdrawal'
}
const valueText = value => {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const changesFor = row => {
  const before = row.old_data || {}
  const after = row.new_data || {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  return keys.filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map(key => ({ key, label: fieldLabel(key), before: valueText(before[key]), after: valueText(after[key]) }))
}
const actorName = row => row.actor_email && row.actor_email !== 'Public link / backend process'
  ? row.actor_email
  : row.actor_email === 'Public link / backend process' ? 'A borrower, guarantor or background process' : 'A workspace user'
const eventSentence = row => {
  const subject = tableLabels[row.table_name] || fieldLabel(row.table_name).toLowerCase() + ' record'
  const verb = row.action === 'INSERT' ? 'created' : row.action === 'UPDATE' ? 'updated' : 'removed'
  const changes = row.action === 'UPDATE' ? changesFor(row) : []
  const summary = changes.length
    ? changes.slice(0, 3).map(item => item.label).join(', ') + (changes.length > 3 ? ` and ${changes.length - 3} other field(s)` : '')
    : ''
  return { subject, verb, summary, changes }
}

export default function AuditTrail() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('all')
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.from('audit_logs').select('*').order('occurred_at', { ascending: false }).limit(300)
    if (error) setError(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter(row => {
    const matchesAction = action === 'all' || row.action === action
    const event = eventSentence(row)
    const term = search.trim().toLowerCase()
    const haystack = [actorName(row), event.subject, event.verb, event.summary, row.record_id, JSON.stringify(row.old_data || {}), JSON.stringify(row.new_data || {})].join(' ').toLowerCase()
    return matchesAction && (!term || haystack.includes(term))
  }), [rows, action, search])

  return <MainLayout>
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><p className="text-xs uppercase tracking-wider font-bold text-slate-500">Governance & records</p><h1 className="text-2xl font-black text-slate-900 mt-1">Audit trail</h1><p className="text-sm text-slate-500 mt-1">A readable history of important activity in the workspace</p></div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50">{loading ? 'Refreshing…' : 'Refresh records'}</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Events loaded', rows.length], ['Records created', rows.filter(r => r.action === 'INSERT').length], ['Records updated', rows.filter(r => r.action === 'UPDATE').length], ['Records removed', rows.filter(r => r.action === 'DELETE').length]].map(([name, value]) => <div key={name} className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500">{name}</p><p className="text-xl font-black text-slate-900 mt-1">{value}</p></div>)}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activity, person, record or changed field…" className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm"/>
        <select value={action} onChange={e => setAction(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="all">All activity</option><option value="INSERT">Records created</option><option value="UPDATE">Records updated</option><option value="DELETE">Records removed</option></select>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Could not load audit history.</strong><p className="mt-1">{error}</p><p className="mt-1 text-xs">If the audit migration has not yet been applied, apply it in Supabase SQL Editor first.</p></div>}
      {loading ? <p className="text-sm text-slate-500">Loading activity…</p> : !error && filtered.length === 0 ? <div className="bg-white border rounded-xl p-8 text-center"><p className="font-semibold text-slate-800">No activity found</p><p className="text-sm text-slate-500 mt-1">New events will appear here as records are created or changed.</p></div> : <div className="bg-white border border-slate-200 rounded-xl overflow-hidden"><div className="divide-y divide-slate-100">{filtered.map(row => {
        const event = eventSentence(row)
        return <div key={row.id} className="p-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className={'text-[10px] font-bold px-2 py-1 rounded '+(row.action==='DELETE'?'bg-red-50 text-red-700':row.action==='UPDATE'?'bg-amber-50 text-amber-700':'bg-blue-50 text-blue-700')}>{row.action==='INSERT'?'CREATED':row.action==='UPDATE'?'UPDATED':'REMOVED'}</span>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm text-slate-900"><span className="font-semibold">{actorName(row)}</span> {event.verb} {event.subject}{row.record_id ? ` (record #${row.record_id})` : ''}.</p>
              {event.summary && <p className="text-sm text-slate-600 mt-1">Changed: {event.summary}.</p>}
              <p className="text-xs text-slate-500 mt-1">{dateTime(row.occurred_at)}</p>
            </div>
            <button onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="text-xs font-semibold text-slate-700 border rounded-lg px-3 py-2">{expanded === row.id ? 'Hide details' : 'What changed?'}</button>
          </div>
          {expanded === row.id && <div className="mt-4 rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Change details</div>
            {row.action === 'UPDATE' && event.changes.length > 0 ? <div className="divide-y divide-slate-100">{event.changes.map(item => <div key={item.key} className="grid sm:grid-cols-[minmax(110px,0.7fr)_1fr_1fr] gap-2 p-3 text-sm">
              <p className="font-semibold text-slate-700">{item.label}</p>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Before</p><p className="text-slate-600 break-words">{item.before}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">After</p><p className="text-slate-900 break-words">{item.after}</p></div>
            </div>)}</div> : <p className="p-3 text-sm text-slate-600">{row.action === 'INSERT' ? 'A new record was added.' : row.action === 'DELETE' ? 'This record was removed.' : 'No field-level differences were captured.'}</p>}
          </div>}
        </div>
      })}</div><div className="border-t bg-slate-50 px-4 py-3 text-xs text-slate-500">Showing up to 300 recent events. Audit history is read-only and records are retained.</div></div>}
    </div>
  </MainLayout>
}
