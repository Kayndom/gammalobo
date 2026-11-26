import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { logLoanToSheets, logPaymentToSheets, logApplicationToSheets, logLoaneeToSheets } from '../lib/sheets'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
const [passwordMessage, setPasswordMessage] = useState('')
const [changingPassword, setChangingPassword] = useState(false)
const [importMessage, setImportMessage] = useState('')
const [syncing, setSyncing] = useState(false)
const [syncMessage, setSyncMessage] = useState('')
const [restorePreview, setRestorePreview] = useState(null)
const [restoreError, setRestoreError] = useState('')
const [checkingRestore, setCheckingRestore] = useState(false)
const [restoreBackupData, setRestoreBackupData] = useState(null)
const [liveComparison, setLiveComparison] = useState(null)
const [comparingLive, setComparingLive] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .single()

    if (data) setSettings(data)
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('settings')
      .update({
        business_name: settings.business_name,
        repayment_bank: settings.repayment_bank,
        repayment_account_name: settings.repayment_account_name,
        repayment_account_no: settings.repayment_account_no,
        standard_interest_rate: settings.standard_interest_rate,
        penalty_interest_rate: settings.penalty_interest_rate,
        loan_duration_days: settings.loan_duration_days,
        monthly_earnings_rate: settings.monthly_earnings_rate,
      })
      .eq('id', settings.id)

    if (error) {
      setMessage('Error saving settings')
    } else {
      setMessage('Settings saved successfully')
    }
    setSaving(false)
  }

  function handleChange(field, value) {
    setSettings({ ...settings, [field]: value })
  }

  if (loading) return (
    <MainLayout>
      <p className="text-gray-500">Loading settings...</p>
    </MainLayout>
  )
  async function handleChangePassword() {
  if (!password || password.length < 6) {
    setPasswordMessage('Password must be at least 6 characters')
    return
  }
  setChangingPassword(true)
  setPasswordMessage('')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    setPasswordMessage('Error updating password: ' + error.message)
  } else {
    setPasswordMessage('Password updated successfully')
    setPassword('')
  }
  setChangingPassword(false)
}
function downloadCSV(filename, rows) {
  const csv = rows.map(r => Object.values(r).map(v =>
    `"${String(v ?? '').replace(/"/g, '""')}"`
  ).join(',')).join('\n')
  const headers = Object.keys(rows[0]).join(',')
  const blob = new Blob([headers + '\n' + csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportLoans() {
  const { data } = await supabase
    .from('loans')
    .select('*, applicants(full_name, phone), guarantors(full_name, phone)')
    .order('created_at', { ascending: false })
  if (!data || data.length === 0) return alert('No loans to export')
  const rows = data.map(l => ({
    id: l.id,
    loanee: l.applicants?.full_name,
    phone: l.applicants?.phone,
    guarantor: l.guarantors?.full_name,
    guarantor_phone: l.guarantors?.phone,
    principal: l.principal,
    interest_rate: l.interest_rate,
    interest_amount: l.interest_amount,
    total_owed: l.total_owed,
    amount_paid: l.amount_paid,
    outstanding_balance: l.outstanding_balance,
    loan_type: l.loan_type,
    status: l.status,
    rollover_count: l.rollover_count,
    disbursed_at: l.disbursed_at,
    due_date: l.due_date,
    created_at: l.created_at,
  }))
  downloadCSV(`regnum_loans_${new Date().toISOString().slice(0,10)}.csv`, rows)
}

async function exportLoanees() {
  const { data } = await supabase
    .from('applicants')
    .select('*')
    .not('full_name', 'eq', 'Pending')
    .order('created_at', { ascending: false })
  if (!data || data.length === 0) return alert('No loanees to export')
  const rows = data.map(l => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    email: l.email,
    address: l.address,
    occupation: l.occupation,
    bvn: l.bvn,
    nin: l.nin,
    id_type: l.id_type,
    id_number: l.id_number,
    bank_name: l.bank_name,
    account_number: l.account_number,
    account_name: l.account_name,
    created_at: l.created_at,
  }))
  downloadCSV(`regnum_loanees_${new Date().toISOString().slice(0,10)}.csv`, rows)
}

async function exportPayments() {
  const { data } = await supabase
    .from('instalments')
    .select('*, loans(applicants(full_name))')
    .order('recorded_at', { ascending: false })
  if (!data || data.length === 0) return alert('No payments to export')
  const rows = data.map(p => ({
    id: p.id,
    loan_id: p.loan_id,
    loanee: p.loans?.applicants?.full_name,
    amount_paid: p.amount_paid,
    payment_date: p.payment_date,
    note: p.note,
    recorded_at: p.recorded_at,
  }))
  downloadCSV(`regnum_payments_${new Date().toISOString().slice(0,10)}.csv`, rows)
}

async function exportApplications() {
  const { data } = await supabase
    .from('applications')
    .select('*, applicants(full_name, phone), guarantors(full_name, phone)')
    .order('created_at', { ascending: false })
  if (!data || data.length === 0) return alert('No applications to export')
  const rows = data.map(a => ({
    id: a.id,
    loanee: a.applicants?.full_name,
    phone: a.applicants?.phone,
    guarantor: a.guarantors?.full_name,
    guarantor_phone: a.guarantors?.phone,
    loan_amount_requested: a.loan_amount_requested,
    purpose: a.purpose,
    status: a.status,
    rejection_reason: a.rejection_reason,
    created_at: a.created_at,
    reviewed_at: a.reviewed_at,
  }))
  downloadCSV(`regnum_applications_${new Date().toISOString().slice(0,10)}.csv`, rows)
}

async function handleImport(e) {
  const file = e.target.files[0]
  if (!file) return
  setImportMessage('')
  const text = await file.text()
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  const rows = lines.slice(1).map(line => {
    const values = line.match(/(".*?"|[^,]+)(?=,|$)/g) || []
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = (values[i] || '').replace(/"/g, '').trim()
    })
    return obj
  })
  try {
    if (headers.includes('outstanding_balance')) {
      setImportMessage(`✓ Loans backup verified — ${rows.length} records found. Contact support to restore.`)
    } else if (headers.includes('bvn')) {
      const inserts = rows.map(r => ({
        full_name: r.full_name,
        phone: r.phone,
        email: r.email || null,
        address: r.address || null,
        occupation: r.occupation || null,
        bvn: r.bvn || null,
        nin: r.nin || null,
        bank_name: r.bank_name || null,
        account_number: r.account_number || null,
        account_name: r.account_name || null,
      }))
      const { error } = await supabase.from('applicants').insert(inserts)
      if (error) throw error
      setImportMessage(`✓ ${rows.length} loanees imported successfully`)
    } else if (headers.includes('amount_paid')) {
      setImportMessage(`✓ Payments backup verified — ${rows.length} records found. Contact support to restore.`)
    } else if (headers.includes('loan_amount_requested')) {
      setImportMessage(`✓ Applications backup verified — ${rows.length} records found.`)
    } else {
      setImportMessage('Error: Unrecognized CSV format')
    }
  } catch (err) {
    setImportMessage('Error importing file: ' + err.message)
    console.error(err)
  }
}
async function exportAll() {
  // Every business-data table currently used by the application.
  // Fetch in pages so Supabase's default row limit cannot silently truncate backups.
  const tables = [
    'settings',
    'applicants',
    'guarantors',
    'applications',
    'loans',
    'instalments',
    'loan_logs',
    'rollovers',
    'capital_injections',
    'profit_withdrawals',
    'investors',
    'investments',
    'investor_accruals',
    'investor_payments',
    'audit_logs',
  ]

  setImportMessage('')
  const backupTables = {}
  const recordCounts = {}
  const pageSize = 1000

  try {
    for (const table of tables) {
      let allRows = []
      let from = 0
      while (true) {
        const to = from + pageSize - 1
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(from, to)

        if (error) throw new Error(table + ': ' + error.message)
        const page = data || []
        allRows = allRows.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }
      backupTables[table] = allRows
      recordCounts[table] = allRows.length
    }

    const date = new Date().toISOString()
    const totalRecords = Object.values(recordCounts).reduce((sum, count) => sum + count, 0)
    const backup = {
      format: 'REGNUM_COMPLETE_APP_DATA_BACKUP',
      version: 2,
      created_at: date,
      business: settings?.business_name || 'REGNUM Ventures',
      coverage: {
        description: 'Complete row-level snapshot of all application business-data tables listed below.',
        tables_included: tables,
        record_counts: recordCounts,
        total_records: totalRecords,
        pagination: 'Fetched in pages of 1000 rows until every table was exhausted.',
        excludes: [
          'Supabase Auth credentials and password hashes (security-sensitive platform data, not available to the app export)',
          'Supabase platform configuration, API keys and database schema definitions',
          'External Google Sheets copies (these are separate external documents)',
          'Storage files, because this application currently has no active user-document upload workflow in this backup',
        ],
      },
      tables: backupTables,
      record_counts: recordCounts,
      total_records: totalRecords,
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `regnum_complete_app_backup_${date.slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    alert('Complete application data backup downloaded: ' + totalRecords + ' records across ' + tables.length + ' data tables. See the coverage section inside the file for exact counts and exclusions. Store it securely.')
  } catch (err) {
    alert('Backup was not created. ' + err.message + '. No partial backup was downloaded.')
    console.error('Complete backup failed:', err)
  }
}
async function inspectBackupFile(e) {
  const file = e.target.files?.[0]
  setRestorePreview(null)
  setRestoreBackupData(null)
  setLiveComparison(null)
  setRestoreError('')
  if (!file) return
  setCheckingRestore(true)
  try {
    if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a REGNUM JSON backup file.')
    const parsed = JSON.parse(await file.text())
    const expectedTables = ['settings','applicants','guarantors','applications','loans','instalments','loan_logs','rollovers','capital_injections','profit_withdrawals','investors','investments','investor_accruals','investor_payments','audit_logs']
    if (parsed.format !== 'REGNUM_COMPLETE_APP_DATA_BACKUP' || parsed.version !== 2) throw new Error('This is not a supported REGNUM complete backup (version 2).')
    if (!parsed.tables || typeof parsed.tables !== 'object') throw new Error('The backup is missing its tables section.')
    const missing = expectedTables.filter(table => !Array.isArray(parsed.tables[table]))
    if (missing.length) throw new Error('Backup is incomplete. Missing or invalid tables: ' + missing.join(', '))
    const counts = {}
    for (const table of expectedTables) {
      counts[table] = parsed.tables[table].length
      if (parsed.record_counts?.[table] !== counts[table]) throw new Error('Record count mismatch for ' + table + '. The file may be incomplete or altered.')
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    if (parsed.total_records !== total) throw new Error('The total record count does not match the contents of the backup.')
    setRestoreBackupData(parsed)
    setRestorePreview({ fileName: file.name, createdAt: parsed.created_at || 'Not recorded', total, counts, business: parsed.business || 'REGNUM Ventures', exclusions: parsed.coverage?.excludes || [] })
  } catch (err) {
    setRestoreError(err.message || 'Could not inspect this backup file.')
  } finally {
    setCheckingRestore(false)
    e.target.value = ''
  }
}


async function compareBackupWithLive() {
  if (!restoreBackupData) return
  setComparingLive(true); setRestoreError(''); setLiveComparison(null)
  const tables = ['settings','applicants','guarantors','applications','loans','instalments','loan_logs','rollovers','capital_injections','profit_withdrawals','investors','investments','investor_accruals','investor_payments','audit_logs']
  const foreignKeys = [
    ['applications','applicant_id','applicants'],['applications','guarantor_id','guarantors'],['guarantors','applicant_id','applicants'],
    ['instalments','loan_id','loans'],['investments','investor_id','investors'],['investor_accruals','investment_id','investments'],
    ['investor_payments','investment_id','investments'],['loan_logs','loan_id','loans'],['loans','applicant_id','applicants'],
    ['loans','application_id','applications'],['loans','guarantor_id','guarantors'],['rollovers','loan_id','loans']
  ]
  try {
    const live = {}, liveById = {}
    for (const table of tables) {
      let rows = [], from = 0
      while (true) {
        const { data, error } = await supabase.from(table).select('*').range(from, from + 999)
        if (error) throw new Error('Could not read live ' + table + ': ' + error.message)
        const page = data || []; rows = rows.concat(page)
        if (page.length < 1000) break
        from += 1000
      }
      live[table] = rows; liveById[table] = new Map(rows.map(row => [String(row.id), row]))
    }
    const backupIds = {}
    for (const table of tables) backupIds[table] = new Set((restoreBackupData.tables[table] || []).map(row => String(row.id)))
    const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.keys(value).sort().reduce((o,k) => {o[k]=stable(value[k]);return o}, {}) : value
    const summary = {}, conflicts = [], missingRowsByTable = {}
    for (const table of tables) {
      let missing=0, identical=0, different=0; const missingRows=[]
      for (const row of restoreBackupData.tables[table] || []) {
        const existing = liveById[table].get(String(row.id))
        if (!existing) { missing++; missingRows.push(row) }
        else if (JSON.stringify(stable(existing)) === JSON.stringify(stable(row))) identical++
        else { different++; if (conflicts.length < 20) conflicts.push({table,id:String(row.id)}) }
      }
      summary[table] = {backup:restoreBackupData.tables[table].length,live:live[table].length,missing,identical,different}
      missingRowsByTable[table]=missingRows
    }
    const brokenReferences=[]
    for (const [child,column,parent] of foreignKeys) for (const row of missingRowsByTable[child]) {
      const ref=row[column]
      if (ref && !backupIds[parent].has(String(ref)) && !liveById[parent].has(String(ref)) && brokenReferences.length<20)
        brokenReferences.push({table:child,column,expectedTable:parent})
    }
    setLiveComparison({summary, totalMissing:Object.values(summary).reduce((n,x)=>n+x.missing,0), totalDifferent:Object.values(summary).reduce((n,x)=>n+x.different,0), totalIdentical:Object.values(summary).reduce((n,x)=>n+x.identical,0), conflicts, brokenReferences})
  } catch(err) {
    setRestoreError('Live comparison stopped: ' + err.message + '. No records were changed.')
  } finally { setComparingLive(false) }
}

async function syncAllToSheets() {
  setSyncing(true)
  setSyncMessage('')

  try {
    // Sync loanees
    const { data: loanees } = await supabase
      .from('applicants')
      .select('*')
      .not('full_name', 'eq', 'Pending')
    if (loanees) {
      for (const loanee of loanees) {
        await logLoaneeToSheets(loanee)
      }
    }

    // Sync applications
    const { data: apps } = await supabase
      .from('applications')
      .select('*, applicants(*), guarantors(*)')
      .eq('status', 'approved')
    if (apps) {
      for (const app of apps) {
        await logApplicationToSheets(app, app.applicants, app.guarantors)
      }
    }

    // Sync loans
    const { data: loans } = await supabase
      .from('loans')
      .select('*, applicants(*), guarantors(*)')
    if (loans) {
      for (const loan of loans) {
        await logLoanToSheets(loan, loan.applicants, loan.guarantors)
      }
    }

    // Sync payments
    const { data: payments } = await supabase
      .from('instalments')
      .select('*, loans(applicants(full_name))')
    if (payments) {
      for (const payment of payments) {
        await logPaymentToSheets(payment, payment.loans?.applicants?.full_name)
      }
    }

    setSyncMessage('✓ All data synced to Google Sheets successfully')
  } catch (err) {
    setSyncMessage('Error syncing data: ' + err.message)
    console.error(err)
  }

  setSyncing(false)
}

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">

        <div className="mb-7"><p className="text-xs uppercase tracking-[.14em] font-semibold text-slate-500 mb-1">ADMINISTRATION</p>
          <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
          <p className="text-slate-500 text-sm">Manage business information, lending defaults, security and backups</p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 sm:p-7 space-y-7">

          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-4">
              Business Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                <input
                  type="text"
                  value={settings.business_name || ''}
                  onChange={(e) => handleChange('business_name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repayment Bank</label>
                <input
                  type="text"
                  value={settings.repayment_bank || ''}
                  onChange={(e) => handleChange('repayment_bank', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input
                  type="text"
                  value={settings.repayment_account_name || ''}
                  onChange={(e) => handleChange('repayment_account_name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                <input
                  type="text"
                  value={settings.repayment_account_no || ''}
                  onChange={(e) => handleChange('repayment_account_no', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
              Loan Settings
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Standard Interest Rate (%)
                </label>
                <input
                  type="number"
                  value={settings.standard_interest_rate || ''}
                  onChange={(e) => handleChange('standard_interest_rate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Penalty Interest Rate (%)
                </label>
                <input
                  type="number"
                  value={settings.penalty_interest_rate || ''}
                  onChange={(e) => handleChange('penalty_interest_rate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Loan Duration (days)
                </label>
                <input
                  type="number"
                  value={settings.loan_duration_days || ''}
                  onChange={(e) => handleChange('loan_duration_days', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Monthly Earnings Rate (% of profit)
  </label>
  <input
    type="number"
    value={settings.monthly_earnings_rate || ''}
    onChange={(e) => handleChange('monthly_earnings_rate', e.target.value)}
    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
  <p className="text-xs text-gray-400 mt-1">Percentage of total profit suggested as your monthly earnings</p>
</div>
            </div>
          </div>

          {message && (
            <p className={`text-sm ${message.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
              {message}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-slate-800 text-white py-3 rounded-md text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <div className="border-t pt-6">
  <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
    Change Password
  </h2>
  <div className="space-y-3">
    <input
      type="password"
      placeholder="Enter new password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    {passwordMessage && (
      <p className={`text-sm ${passwordMessage.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
        {passwordMessage}
      </p>
    )}
    <button
      onClick={handleChangePassword}
      disabled={changingPassword}
      className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-900 transition disabled:opacity-50"
    >
      {changingPassword ? 'Updating...' : 'Update Password'}
    </button>
  </div>
</div>

        </div>
      </div>
      <div className="border-t pt-6">
  <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
    Data Backup
  </h2>
  <div className="space-y-3">
    <button
      onClick={exportLoans}
      className="w-full py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
      style={{ background: '#24384b' }}
    >
      Export Loans to CSV
    </button>

    <button
      onClick={exportLoanees}
      className="w-full py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
      style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
    >
      Export Loanees to CSV
    </button>
    <button
      onClick={exportPayments}
      className="w-full py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
      style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
    >
      Export Payments to CSV
    </button>
    <button
      onClick={exportApplications}
      className="w-full py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
      style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
    >
      Export Applications to CSV
    </button>
    <button
  onClick={exportAll}
  className="w-full py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
  style={{ background: '#24384b' }}
>
  Download All App Data (JSON)
</button>
<p className="text-xs text-slate-500">Includes every business-data table used by the app, full row contents, audit history and record counts. Large tables are downloaded in pages to avoid silent row-limit omissions. Login credentials, platform secrets, external Google Sheets and uploaded storage files are excluded and identified in the backup manifest.</p>
<div className="border-t pt-3">
  <p className="text-xs text-gray-500 mb-2">Sync all existing data to Google Sheets</p>
  {syncMessage && (
    <p className={`text-sm mb-2 ${syncMessage.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
      {syncMessage}
    </p>
  )}
  <button
    onClick={syncAllToSheets}
    disabled={syncing}
    className="w-full py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
    style={{ background: '#475569' }}
  >
    {syncing ? 'Syncing...' : '📊 Sync All Data to Google Sheets'}
  </button>
</div>
    <div className="border-t pt-5">
  <h3 className="text-sm font-semibold text-slate-800 mb-2">Restore backup — validation preview</h3>
  <p className="text-xs text-slate-500 mb-3">Select a REGNUM JSON backup to check its format, required tables and record counts. This step is read-only: it does not change or restore any live records.</p>
  <label className="w-full py-3 rounded-md text-sm font-medium text-center block cursor-pointer border border-slate-300 hover:border-slate-500 transition text-slate-700">
    {checkingRestore ? 'Checking backup…' : 'Choose JSON backup to inspect'}
    <input type="file" className="hidden" onChange={inspectBackupFile} disabled={checkingRestore} />
  </label>
  {restoreError && <p className="text-sm text-red-600 mt-3">Backup check failed: {restoreError}</p>}
  {restorePreview && (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div><p className="text-sm font-semibold text-slate-800">Backup passed the structural checks</p><p className="text-xs text-slate-500">{restorePreview.fileName} · {restorePreview.business} · {restorePreview.createdAt}</p></div>
      <p className="text-sm text-slate-700"><strong>{restorePreview.total.toLocaleString()}</strong> records across {Object.keys(restorePreview.counts).length} required data tables</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{Object.entries(restorePreview.counts).map(([table,count])=><div key={table} className="flex justify-between gap-3 text-xs border-b border-slate-200 py-1"><span className="text-slate-600">{table}</span><strong className="text-slate-800">{count.toLocaleString()}</strong></div>)}</div>
      {restorePreview.exclusions.length>0 && <div><p className="text-xs font-semibold text-slate-700 mb-1">Not contained in this file</p><ul className="list-disc pl-5 text-xs text-slate-500 space-y-1">{restorePreview.exclusions.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
      <button type="button" onClick={compareBackupWithLive} disabled={comparingLive} className="w-full py-3 rounded-md text-sm font-semibold text-white disabled:opacity-50" style={{background:'#24384b'}}>{comparingLive?'Comparing with live database…':'Compare backup with live database (read-only)'}</button>
      {liveComparison && <div className="border-t border-slate-200 pt-3 space-y-3">
        <p className="text-sm font-semibold text-slate-800">Live comparison complete — read-only</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded border bg-white p-3"><strong className="block text-lg">{liveComparison.totalMissing.toLocaleString()}</strong><span className="text-slate-500">Backup records not in live DB</span></div>
          <div className="rounded border bg-white p-3"><strong className="block text-lg">{liveComparison.totalIdentical.toLocaleString()}</strong><span className="text-slate-500">Existing identical records</span></div>
          <div className="rounded border bg-white p-3"><strong className="block text-lg">{liveComparison.totalDifferent.toLocaleString()}</strong><span className="text-slate-500">Existing IDs with differences</span></div>
        </div>
        {Object.entries(liveComparison.summary).map(([table,item])=><div key={table} className="flex flex-wrap justify-between gap-2 border-b border-slate-200 py-2 text-xs"><strong className="text-slate-700">{table}</strong><span className="text-slate-500">Backup {item.backup} · Live {item.live} · Missing {item.missing} · Identical {item.identical} · Different {item.different}</span></div>)}
        {liveComparison.brokenReferences.length>0 && <div className="rounded border border-red-200 bg-red-50 p-3"><p className="text-sm font-semibold text-red-800">Missing relationship targets</p><p className="text-xs text-red-700">{liveComparison.brokenReferences.length} missing parent references detected (up to 20 shown). These must be resolved before any import.</p></div>}
        {liveComparison.totalDifferent>0 && <div className="rounded border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-800">Conflicting existing records ({liveComparison.totalDifferent})</p><p className="text-xs text-amber-700">The same IDs exist with different contents. No overwrite will be attempted. Example tables: {Array.from(new Set(liveComparison.conflicts.map(x=>x.table))).join(', ')}.</p></div>}
        {liveComparison.totalDifferent===0 && liveComparison.brokenReferences.length===0 && <p className="text-xs text-emerald-700">No ID conflicts or missing relationship targets were detected. No records have been restored.</p>}
        <p className="text-xs text-slate-500">Read-only comparison: no inserts, updates or deletes were performed. Write-enabled restoration remains disabled.</p>
      </div>}
    </div>
  )}
</div>
<div className="border-t pt-3">
      <p className="text-xs text-gray-500 mb-2">Legacy CSV import (limited)</p><p className="text-xs text-amber-700 mb-2">This is not a full restore tool. It can import borrower rows only; other CSV files are only checked, not restored. Do not use it to restore financial records.</p>
      <label className="w-full py-2 rounded-lg text-sm font-medium text-center block cursor-pointer border-2 border-dashed border-gray-300 hover:border-blue-400 transition text-gray-500">
        Click to Import CSV
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleImport}
        />
      </label>
      {importMessage && (
        <p className={`text-sm mt-2 ${importMessage.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
          {importMessage}
        </p>
      )}
    </div>
  </div>
</div>
    </MainLayout>
  )
}
