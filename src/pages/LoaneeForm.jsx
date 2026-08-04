import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoaneeForm() {
  const { token } = useParams()
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(null)
  const [applicationData, setApplicationData] = useState(null)

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', address: '', occupation: '',
    bvn: '', nin: '', bank_name: '', account_number: '', account_name: '',
    guarantor_name: '', guarantor_phone: '', guarantor_email: '',
  })

  useEffect(() => {
    async function fetchData() {
      const { data: settingsData } = await supabase.from('settings').select('*').single()
      if (settingsData) setSettings(settingsData)
      const { data: appData } = await supabase
        .from('applications')
        .select('custom_interest_rate, custom_duration_days')
        .eq('loanee_token', token)
        .single()
      if (appData) setApplicationData(appData)
    }
    fetchData()
  }, [token])

  function handleChange(field, value) {
    setForm({ ...form, [field]: value })
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')

    if (!form.bvn && !form.nin) {
      setError('Please provide at least your BVN or NIN.')
      setLoading(false)
      return
    }

    try {
      const { data: application, error: appError } = await supabase
        .from('applications').select('*, applicants(*)')
        .eq('loanee_token', token).single()

      if (appError || !application) { setError('Invalid or expired application link.'); setLoading(false); return }
      if (!application.status) { setError('Invalid application. Please contact Regnum Ventures.'); setLoading(false); return }
      if (application.status === 'cancelled') { setError('This application has been cancelled.'); setLoading(false); return }
      if (application.status !== 'pending_loanee') { setError('This application has already been submitted.'); setLoading(false); return }

      let applicantId = null
      const { data: existing } = await supabase
        .from('applicants').select('*')
        .or(`phone.eq.${form.phone},bvn.eq.${form.bvn}`)
        .not('full_name', 'eq', 'Pending').maybeSingle()

      if (existing) {
        await supabase.from('applicants').update({
          full_name: form.full_name, phone: form.phone, email: form.email,
          address: form.address, occupation: form.occupation, bvn: form.bvn,
          nin: form.nin, bank_name: form.bank_name,
          account_number: form.account_number, account_name: form.account_name,
        }).eq('id', existing.id)
        applicantId = existing.id
        await supabase.from('applicants').delete().eq('id', application.applicant_id)
      } else {
        await supabase.from('applicants').update({
          full_name: form.full_name, phone: form.phone, email: form.email,
          address: form.address, occupation: form.occupation, bvn: form.bvn,
          nin: form.nin, bank_name: form.bank_name,
          account_number: form.account_number, account_name: form.account_name,
        }).eq('id', application.applicant_id)
        applicantId = application.applicant_id
      }

      const guarantorToken = crypto.randomUUID()
      const { data: guarantor, error: guarantorError } = await supabase
        .from('guarantors').insert({
          applicant_id: applicantId,
          full_name: form.guarantor_name,
          phone: form.guarantor_phone,
          email: form.guarantor_email,
          relationship: '',
        }).select().single()

      if (guarantorError) throw guarantorError

      await supabase.from('applications').update({
        status: 'pending_guarantor',
        applicant_id: applicantId,
        guarantor_id: guarantor.id,
        guarantor_token: guarantorToken,
      }).eq('id', application.id)

      setSubmitted(true)
    } catch (err) {
      setError('Something went wrong. Please try again.')
      console.error(err)
    }
    setLoading(false)
  }

  const displayRate = applicationData?.custom_interest_rate ?? settings?.standard_interest_rate ?? 18
  const displayDuration = applicationData?.custom_duration_days ?? settings?.loan_duration_days ?? 30
  const penaltyRate = settings?.penalty_interest_rate ?? 20

  if (submitted) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
        <div className="text-green-500 text-5xl mb-4">✓</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Application Submitted</h2>
        <p className="text-gray-500 text-sm">Your guarantor will receive a link to complete their section. You will be contacted once your application is reviewed.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-xl mx-auto">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
            <span className="text-2xl font-black text-white">R</span>
          </div>
          <h1 className="text-2xl font-black text-gray-800">{settings?.business_name || 'Regnum Ventures'}</h1>
          <p className="text-gray-500 text-sm mt-1">Loan Application Form</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-center">
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Personal Information</h2>
            <div className="space-y-4">
              {[
                { label: 'Full Name *', field: 'full_name', type: 'text' },
                { label: 'Phone Number *', field: 'phone', type: 'tel' },
                { label: 'Email', field: 'email', type: 'email' },
                { label: 'Occupation *', field: 'occupation', type: 'text' },
              ].map(item => (
                <div key={item.field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                  <input
                    type={item.type}
                    value={form[item.field]}
                    onChange={(e) => handleChange(item.field, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Home Address *</label>
                <textarea
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Identity Verification</h2>
            <p className="text-xs text-gray-500 mb-4">At least one of BVN or NIN is required.</p>
            <div className="space-y-4">
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
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Disbursement Account</h2>
            <p className="text-xs text-gray-500 mb-4">Where should the loan be sent to?</p>
            <div className="space-y-4">
              {[
                { label: 'Bank Name *', field: 'bank_name' },
                { label: 'Account Number *', field: 'account_number' },
                { label: 'Account Name *', field: 'account_name' },
              ].map(item => (
                <div key={item.field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                  <input type="text" value={form[item.field]} onChange={(e) => handleChange(item.field, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Guarantor Information</h2>
            <p className="text-xs text-gray-500 mb-4">Your guarantor will receive a separate link to complete their section.</p>
            <div className="space-y-4">
              {[
                { label: 'Guarantor Full Name *', field: 'guarantor_name', type: 'text' },
                { label: 'Guarantor Phone *', field: 'guarantor_phone', type: 'tel' },
                { label: 'Guarantor Email', field: 'guarantor_email', type: 'email' },
              ].map(item => (
                <div key={item.field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                  <input type={item.type} value={form[item.field]} onChange={(e) => handleChange(item.field, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
              <p className="font-semibold text-gray-700">Terms and Conditions</p>
              <p>Loan Interest Rate: <strong>{displayRate}%</strong> per month</p>
              <p>Duration: <strong>{displayDuration} days</strong></p>
              <p>Repayment Amount: <strong>Loan × {1 + displayRate / 100}</strong></p>
              <p>Penalty for missed payment: <strong>{penaltyRate}%</strong> interest on outstanding balance. A new <strong>{settings?.loan_duration_days ?? 30}-day</strong> loan term applies automatically.</p>
              <p>Repayable to: <strong>{settings?.repayment_account_name}</strong> · {settings?.repayment_bank} · {settings?.repayment_account_no}</p>
              <p>By submitting this form you agree to these terms.</p>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full text-white py-3 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
          >
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>

        </div>
      </div>
    </div>
  )
}