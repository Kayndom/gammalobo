import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function GuarantorForm() {
  const { token } = useParams()
  const [settings, setSettings] = useState(null)
  const [applicationData, setApplicationData] = useState(null)
  const [guarantorData, setGuarantorData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [isConsentOnly, setIsConsentOnly] = useState(false)
  const [appInfo, setAppInfo] = useState(null)

  const [form, setForm] = useState({
    address: '', occupation: '', bvn: '', nin: '', relationship: '',
  })

  useEffect(() => {
    async function fetchData() {
      const { data: settingsData } = await supabase.from('settings').select('*').single()
      if (settingsData) setSettings(settingsData)

      // Check if this is a consent-only token (returning loanee keeping guarantor)
      const { data: consentApp } = await supabase
        .from('applications')
        .select('*, applicants(*), guarantors(*)')
        .eq('guarantor_consent_token', token)
        .single()

      if (consentApp) {
        setIsConsentOnly(true)
        setAppInfo(consentApp)
        setApplicationData(consentApp)
        setGuarantorData(consentApp.guarantors)
        setLoading(false)
        return
      }

      // Regular guarantor form
      const { data: appData } = await supabase
        .from('applications')
        .select('*, applicants(*), guarantors(*)')
        .eq('guarantor_token', token)
        .single()

      if (appData) {
        setApplicationData(appData)
        setAppInfo(appData)
        setGuarantorData(appData.guarantors)
        if (appData.guarantors) {
          setForm(prev => ({
            ...prev,
            address: appData.guarantors.address || '',
            occupation: appData.guarantors.occupation || '',
            bvn: appData.guarantors.bvn || '',
            nin: appData.guarantors.nin || '',
            relationship: appData.guarantors.relationship || '',
          }))
        }
      }
      setLoading(false)
    }
    fetchData()
  }, [token])

  function handleChange(field, value) {
    setForm({ ...form, [field]: value })
  }

  async function handleConsentSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await supabase.from('applications')
        .update({ status: 'pending_review' })
        .eq('id', appInfo.id)
      setSubmitted(true)
    } catch (err) {
      setError('Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')

    if (!form.bvn && !form.nin) {
      setError('Please provide at least your BVN or NIN.')
      setSubmitting(false)
      return
    }

    try {
      const { data: application, error: appError } = await supabase
        .from('applications').select('*, guarantors(*)')
        .eq('guarantor_token', token).single()

      if (appError || !application) { setError('Invalid or expired guarantor link.'); setSubmitting(false); return }
      if (application.status !== 'pending_guarantor') { setError('This guarantor form has already been submitted.'); setSubmitting(false); return }

      await supabase.from('guarantors').update({
        address: form.address, occupation: form.occupation,
        bvn: form.bvn, nin: form.nin, relationship: form.relationship,
        submitted_at: new Date().toISOString(),
      }).eq('id', application.guarantor_id)

      await supabase.from('applications')
        .update({ status: 'pending_review' })
        .eq('id', application.id)

      setSubmitted(true)
    } catch (err) {
      setError('Something went wrong. Please try again.')
      console.error(err)
    }
    setSubmitting(false)
  }

  const displayRate = applicationData?.custom_interest_rate ?? settings?.standard_interest_rate ?? 18
  const displayDuration = applicationData?.custom_duration_days ?? settings?.loan_duration_days ?? 30
  const penaltyRate = settings?.penalty_interest_rate ?? 20

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-gray-400">Loading...</p>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
        <div className="text-green-500 text-5xl mb-4">✓</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {isConsentOnly ? 'Consent Confirmed' : 'Thank You'}
        </h2>
        <p className="text-gray-500 text-sm">
          {isConsentOnly
            ? 'You have consented to guarantee this new loan. The application is now under review.'
            : 'Your guarantor information has been submitted successfully. The loan application is now under review.'}
        </p>
      </div>
    </div>
  )

  if (isConsentOnly) return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-xl mx-auto">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
            <span className="text-2xl font-black text-white">R</span>
          </div>
          <h1 className="text-2xl font-black text-gray-800">{settings?.business_name || 'Regnum Ventures'}</h1>
          <p className="text-gray-500 text-sm mt-1">Guarantor Consent</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-blue-800 text-sm font-bold mb-1">New Loan Consent Required</p>
            <p className="text-blue-700 text-xs">
              <strong>{appInfo?.applicants?.full_name}</strong> has applied for a new loan and has listed you as their guarantor again. You must consent to this new loan for their application to proceed.
            </p>
          </div>

          <div className="space-y-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Loanee</p>
              <p className="text-sm font-bold text-gray-800">{appInfo?.applicants?.full_name}</p>
              <p className="text-xs text-gray-500">{appInfo?.applicants?.phone}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Loan Amount</p>
                <p className="text-sm font-bold text-gray-800">₦{Number(appInfo?.loan_amount_requested).toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Interest Rate</p>
                <p className="text-sm font-bold text-gray-800">{displayRate}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Duration</p>
                <p className="text-sm font-bold text-gray-800">{displayDuration} days</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Total Repayable</p>
                <p className="text-sm font-bold text-gray-800">
                  ₦{(Number(appInfo?.loan_amount_requested) * (1 + displayRate / 100)).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
            <p className="font-semibold text-gray-700">Guarantor Agreement</p>
            <p>By clicking "I Consent", you confirm that you are aware of this new loan and agree to continue as guarantor.</p>
            <p>In the event of default, a penalty of <strong>{penaltyRate}%</strong> interest applies for a new <strong>{settings?.loan_duration_days ?? 30}-day</strong> term while legal action is pursued.</p>
            <p>Repayable to: <strong>{settings?.repayment_account_name}</strong> · {settings?.repayment_bank} · {settings?.repayment_account_no}</p>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button onClick={handleConsentSubmit} disabled={submitting}
            className="w-full text-white py-3 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
            {submitting ? 'Submitting...' : '✓ I Consent to This New Loan'}
          </button>

        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-xl mx-auto">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
            <span className="text-2xl font-black text-white">R</span>
          </div>
          <h1 className="text-2xl font-black text-gray-800">{settings?.business_name || 'Regnum Ventures'}</h1>
          <p className="text-gray-500 text-sm mt-1">Guarantor Form</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
            You have been listed as a guarantor for a loan application. Please complete your details below.
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Your Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Home Address *</label>
                <textarea value={form.address} onChange={(e) => handleChange('address', e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Occupation *</label>
                <input type="text" value={form.occupation} onChange={(e) => handleChange('occupation', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship to Applicant *</label>
                <input type="text" value={form.relationship} onChange={(e) => handleChange('relationship', e.target.value)}
                  placeholder="e.g. Brother, Colleague, Friend"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-gray-500">At least one of BVN or NIN is required.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">BVN</label>
                <input type="text" value={form.bvn} onChange={(e) => handleChange('bvn', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIN</label>
                <input type="text" value={form.nin} onChange={(e) => handleChange('nin', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
              <p className="font-semibold text-gray-700">Guarantor Agreement</p>
              <p>By submitting this form, you confirm that you are aware of the loan application and agree to stand as guarantor.</p>
              <p>Loan interest rate: <strong>{displayRate}%</strong> for <strong>{displayDuration} days</strong>.</p>
              <p>In the event of default, a penalty of <strong>{penaltyRate}%</strong> interest applies for a new <strong>{settings?.loan_duration_days ?? 30}-day</strong> term while legal action is pursued.</p>
              <p>Repayable to: <strong>{settings?.repayment_account_name}</strong> · {settings?.repayment_bank} · {settings?.repayment_account_no}</p>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button onClick={handleSubmit} disabled={submitting}
            className="w-full text-white py-3 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
            {submitting ? 'Submitting...' : 'Submit Guarantor Form'}
          </button>

        </div>
      </div>
    </div>
  )
}