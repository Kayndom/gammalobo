import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
const [passwordMessage, setPasswordMessage] = useState('')
const [changingPassword, setChangingPassword] = useState(false)
const [importMessage, setImportMessage] = useState('')

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
  downloadCSV(`gammalobo_loans_${new Date().toISOString().slice(0,10)}.csv`, rows)
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
  downloadCSV(`gammalobo_loanees_${new Date().toISOString().slice(0,10)}.csv`, rows)
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
  downloadCSV(`gammalobo_payments_${new Date().toISOString().slice(0,10)}.csv`, rows)
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
  downloadCSV(`gammalobo_applications_${new Date().toISOString().slice(0,10)}.csv`, rows)
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
  const [
    { data: loans },
    { data: loanees },
    { data: payments },
    { data: applications }
  ] = await Promise.all([
    supabase.from('loans').select('*, applicants(full_name, phone), guarantors(full_name, phone)').order('created_at', { ascending: false }),
    supabase.from('applicants').select('*').not('full_name', 'eq', 'Pending').order('created_at', { ascending: false }),
    supabase.from('instalments').select('*, loans(applicants(full_name))').order('recorded_at', { ascending: false }),
    supabase.from('applications').select('*, applicants(full_name, phone), guarantors(full_name, phone)').order('created_at', { ascending: false }),
  ])

  const date = new Date().toISOString().slice(0, 10)

  const sections = []

  if (loans?.length) {
    sections.push('=== LOANS ===')
    const headers = ['id','loanee','phone','guarantor','guarantor_phone','principal','interest_rate','interest_amount','total_owed','amount_paid','outstanding_balance','loan_type','status','rollover_count','disbursed_at','due_date','created_at']
    sections.push(headers.join(','))
    loans.forEach(l => {
      sections.push([
        l.id, l.applicants?.full_name, l.applicants?.phone,
        l.guarantors?.full_name, l.guarantors?.phone,
        l.principal, l.interest_rate, l.interest_amount,
        l.total_owed, l.amount_paid, l.outstanding_balance,
        l.loan_type, l.status, l.rollover_count,
        l.disbursed_at, l.due_date, l.created_at
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    })
    sections.push('')
  }

  if (loanees?.length) {
    sections.push('=== LOANEES ===')
    const headers = ['id','full_name','phone','email','address','occupation','bvn','nin','id_type','id_number','bank_name','account_number','account_name','created_at']
    sections.push(headers.join(','))
    loanees.forEach(l => {
      sections.push([
        l.id, l.full_name, l.phone, l.email, l.address,
        l.occupation, l.bvn, l.nin, l.id_type, l.id_number,
        l.bank_name, l.account_number, l.account_name, l.created_at
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    })
    sections.push('')
  }

  if (payments?.length) {
    sections.push('=== PAYMENTS ===')
    const headers = ['id','loan_id','loanee','amount_paid','payment_date','note','recorded_at']
    sections.push(headers.join(','))
    payments.forEach(p => {
      sections.push([
        p.id, p.loan_id, p.loans?.applicants?.full_name,
        p.amount_paid, p.payment_date, p.note, p.recorded_at
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    })
    sections.push('')
  }

  if (applications?.length) {
    sections.push('=== APPLICATIONS ===')
    const headers = ['id','loanee','phone','guarantor','guarantor_phone','loan_amount_requested','status','rejection_reason','created_at','reviewed_at']
    sections.push(headers.join(','))
    applications.forEach(a => {
      sections.push([
        a.id, a.applicants?.full_name, a.applicants?.phone,
        a.guarantors?.full_name, a.guarantors?.phone,
        a.loan_amount_requested, a.status, a.rejection_reason,
        a.created_at, a.reviewed_at
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    })
  }

  if (!sections.length) return alert('No data to export')

  const blob = new Blob([sections.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gammalobo_full_backup_${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <p className="text-gray-500 text-sm">Manage your business details and loan rates</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
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

          <div className="border-t pt-6">
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
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
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
      style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
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
  style={{ background: 'linear-gradient(135deg, #c9a84c, #e6c97a)' }}
>
  Export Everything (Full Backup)
</button>
    <div className="border-t pt-3">
      <p className="text-xs text-gray-500 mb-2">Import CSV backup to restore data</p>
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