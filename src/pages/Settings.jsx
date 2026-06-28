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
    </MainLayout>
  )
}