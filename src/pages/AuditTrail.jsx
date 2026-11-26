import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

const label = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const dateTime = value => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

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
    const term = search.trim().toLowerCase()
    const haystack = [row.actor_email, row.table_name, row.record_id, row.action, JSON.stringify(row.old_data || {}), JSON.stringify(row.new_data || {})].join(' ').toLowerCase()
    return matchesAction && (!term || haystack.includes(term))
  }), [rows, action, search])

  return <MainLayout>
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><p className="text-xs uppercase tracking-wider font-bold text-slate-500">Governance & records</p><h1 className="text-2xl font-black text-slate-900 mt-1">Audit trail</h1><p className="text-sm text-slate-500 mt-1">A chronological record of important changes made in the workspace</p></div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50">{loading ? 'Refreshing…' : 'Refresh records'}</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Events loaded', rows.length], ['Created', rows.filter(r => r.action === 'INSERT').length], ['Updated', rows.filter(r => r.action === 'UPDATE').length], ['Deleted', rows.filter(r => r.action === 'DELETE').length]].map(([name, value]) => <div key={name} className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500">{name}</p><p className="text-xl font-black text-slate-900 mt-1">{value}</p></div>)}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user, record, table or details…" className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm"/>
        <select value={action} onChange={e => setAction(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="all">All actions</option><option value="INSERT">Created</option><option value="UPDATE">Updated</option><option value="DELETE">Deleted</option></select>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Could not load audit history.</strong><p className="mt-1">{error}</p><p className="mt-1 text-xs">If the audit migration has not yet been applied, apply it in Supabase SQL Editor first.</p></div>}
      {loading ? <p className="text-sm text-slate-500">Loading audit history…</p> : !error && filtered.length === 0 ? <div className="bg-white border rounded-xl p-8 text-center"><p className="font-semibold text-slate-800">No audit events found</p><p className="text-sm text-slate-500 mt-1">New events will appear here after the audit migration is active.</p></div> : <div className="bg-white border border-slate-200 rounded-xl overflow-hidden"><div className="divide-y divide-slate-100">{filtered.map(row => <div key={row.id} className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className={'text-[10px] font-bold px-2 py-1 rounded '+(row.action==='DELETE'?'bg-red-50 text-red-700':row.action==='UPDATE'?'bg-amber-50 text-amber-700':'bg-blue-50 text-blue-700')}>{label(row.action)}</span>
          <div className="flex-1 min-w-[180px]"><p className="text-sm font-semibold text-slate-900">{label(row.table_name)} <span className="font-normal text-slate-500">· {row.record_id || 'Record'}</span></p><p className="text-xs text-slate-500 mt-1">{row.actor_email || 'System / service role'} · {dateTime(row.occurred_at)}</p></div>
          <button onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="text-xs font-semibold text-slate-700 border rounded-lg px-3 py-2">{expanded === row.id ? 'Hide details' : 'View changes'}</button>
        </div>
        {expanded === row.id && <div className="grid md:grid-cols-2 gap-3 mt-4">
          <div className="min-w-0"><p className="text-xs font-bold text-slate-500 mb-1">BEFORE</p><pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 border p-3 text-[11px] leading-5 whitespace-pre-wrap break-all">{row.old_data ? JSON.stringify(row.old_data, null, 2) : 'No previous record (new entry).'}</pre></div>
          <div className="min-w-0"><p className="text-xs font-bold text-slate-500 mb-1">AFTER</p><pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 border p-3 text-[11px] leading-5 whitespace-pre-wrap break-all">{row.new_data ? JSON.stringify(row.new_data, null, 2) : 'Record was removed.'}</pre></div>
        </div>}
      </div>)}</div><div className="border-t bg-slate-50 px-4 py-3 text-xs text-slate-500">Showing up to 300 most recent events. Audit records are append-only; personal contact and identity fields are excluded from change snapshots.</div></div>}
    </div>
  </MainLayout>
}
