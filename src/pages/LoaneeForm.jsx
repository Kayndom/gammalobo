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
  const [isReturning, setIsReturning] = useState(false)
  const [keepGuarantor, setKeepGuarantor] = useState(null)
  const [previousGuarantor, setPreviousGuarantor] = useState(null)
  const [detected, setDetected] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [verifiedApplicantId, setVerifiedApplicantId] = useState(null)

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
        .eq('loanee_token', token).single()
      if (appData) setApplicationData(appData)
    }
    fetchData()
  }, [token])

  function handleChange(field, value) {
    setForm({ ...form, [field]: value })
  }

  async function detectReturningLoanee() {
    // Names are not unique identifiers. Only exact, non-empty identifiers
    // may be used to identify a returning applicant.
    const identifiers = [
      ['phone', form.phone.trim()],
      ['bvn', form.bvn.trim()],
      ['nin', form.nin.trim()],
      ['email', form.email.trim().toLowerCase()],
    ].filter(([, value]) => value)

    if (identifiers.length === 0) {
      setError('Please enter your phone number, BVN, NIN or email to check for an existing application. A name alone cannot verify identity.')
      return
    }

    setDetecting(true)
    setError('')
    setVerifiedApplicantId(null)

    try {
      const matches = new Map()
      for (const [field, value] of identifiers) {
        const queryValue = field === 'email' ? value : value
        const { data, error: lookupError } = await supabase
          .from('applicants')
          .select('*')
          .eq(field, queryValue)
          .neq('full_name', 'Pending')
          .limit(2)

        if (lookupError) throw lookupError
        for (const applicant of data || []) matches.set(applicant.id, applicant)
      }

      if (matches.size > 1) {
        setError('These details match more than one applicant record. Please contact REGNUM for assistance. No existing details have been loaded.')
        setDetected(false)
        setIsReturning(false)
        setDetecting(false)
        return
      }

      const existing = [...matches.values()][0]
      if (existing) {
        const conflictingIdentifier = identifiers.some(([field, value]) => {
          const stored = String(existing[field] || '').trim().toLowerCase()
          return stored && stored !== value.trim().toLowerCase()
        })
        if (conflictingIdentifier) {
          setError('Some of the details entered do not agree with the existing record. Please check your information or contact REGNUM for assistance. No existing details have been loaded.')
          setDetected(false)
          setIsReturning(false)
          setDetecting(false)
          return
        }
        setVerifiedApplicantId(existing.id)
        setForm(prev => ({
          ...prev,
          full_name: existing.full_name || prev.full_name,
          phone: existing.phone || prev.phone,
          email: existing.email || prev.email,
          address: existing.address || prev.address,
          occupation: existing.occupation || prev.occupation,
          bvn: existing.bvn || prev.bvn,
          nin: existing.nin || prev.nin,
          bank_name: existing.bank_name || prev.bank_name,
          account_number: existing.account_number || prev.account_number,
          account_name: existing.account_name || prev.account_name,
        }))

        const { data: lastApp, error: lastAppError } = await supabase
          .from('applications')
          .select('*, guarantors(*)')
          .eq('applicant_id', existing.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastAppError) throw lastAppError
        setPreviousGuarantor(lastApp?.guarantors || null)
        setIsReturning(true)
        await supabase.from('applications')
          .update({ is_returning_loanee: true })
          .eq('loanee_token', token)
      } else {
        setIsReturning(false)
        setPreviousGuarantor(null)
      }

      setDetected(true)
    } catch (err) {
      console.error(err)
      setError('We could not safely verify your details. Please check them and try again.')
      setDetected(false)
    } finally {
      setDetecting(false)
    }
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')

    if (!form.bvn && !form.nin) {
      setError('Please provide at least your BVN or NIN.')
      setLoading(false)
      return
    }

    if (isReturning && keepGuarantor === null) {
      setError('Please choose whether to keep or change your guarantor.')
      setLoading(false)
      return
    }

    if (!isReturning || keepGuarantor === false) {
      if (!form.guarantor_name || !form.guarantor_phone) {
        setError('Please provide guarantor name and phone.')
        setLoading(false)
        return
      }
    }

    try {
      const { data: application, error: appError } = await supabase
        .from('applications').select('*, applicants(*)')
        .eq('loanee_token', token).single()

      if (appError || !application) { setError('Invalid or expired application link.'); setLoading(false); return }
      if (!application.status) { setError('Invalid application.'); setLoading(false); return }
      if (application.status === 'cancelled') { setError('This application has been cancelled.'); setLoading(false); return }
      if (application.status !== 'pending_loanee') { setError('This application has already been submitted.'); setLoading(false); return }

      // Never perform a second fuzzy or OR-based identity search at submit.
      // Use only the applicant explicitly verified in the initial check.
      const applicantId = verifiedApplicantId || application.applicant_id
      const applicantFields = {
        full_name: form.full_name, phone: form.phone, email: form.email,
        address: form.address, occupation: form.occupation, bvn: form.bvn,
        nin: form.nin, bank_name: form.bank_name,
        account_number: form.account_number, account_name: form.account_name,
      }

      const { error: applicantUpdateError } = await supabase
        .from('applicants')
        .update(applicantFields)
        .eq('id', applicantId)
      if (applicantUpdateError) throw applicantUpdateError

      if (application.applicant_id !== applicantId) {
        const { error: linkError } = await supabase
          .from('applications')
          .update({ applicant_id: applicantId })
          .eq('id', application.id)
        if (linkError) throw linkError
      }

      if (isReturning && keepGuarantor && previousGuarantor) {
        const consentToken = crypto.randomUUID()
        await supabase.from('applications').update({
          status: 'pending_guarantor',
          applicant_id: applicantId,
          guarantor_id: previousGuarantor.id,
          guarantor_consent_token: consentToken,
          keep_guarantor: true,
          is_returning_loanee: true,
        }).eq('id', application.id)
      } else {
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
          keep_guarantor: false,
          is_returning_loanee: isReturning,
        }).eq('id', application.id)
      }

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
        <p className="text-gray-500 text-sm">
          {isReturning && keepGuarantor
            ? 'Your previous guarantor will receive a consent request for this new loan.'
            : 'Your guarantor will receive a link to complete their section.'}
          {' '}You will be contacted once your application is reviewed.
        </p>
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
          <p className="text-gray-500 text-sm mt-1">Loan Application Form</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-center">
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        )}

        {isReturning && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-blue-800 text-sm font-bold">👋 Welcome back!</p>
            <p className="text-blue-700 text-xs mt-1">We found your previous details and pre-filled the form. Please review and update anything that has changed.</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

          {!detected && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Quick Check</h2>
              <p className="text-xs text-gray-500 mb-4">Enter your phone number, BVN, NIN or email to check for a previous application. Your name alone is never used to identify an existing applicant.</p>
              <div className="space-y-3">
                <input type="text" placeholder="Full Name" value={form.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="tel" placeholder="Phone Number" value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="BVN" value={form.bvn}
                  onChange={(e) => handleChange('bvn', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="NIN" value={form.nin}
                  onChange={(e) => handleChange('nin', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="email" placeholder="Email" value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={detectReturningLoanee} disabled={detecting}
                  className="w-full text-white py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
                  {detecting ? 'Checking...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {detected && (
            <>
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
                      <input type={item.type} value={form[item.field]}
                        onChange={(e) => handleChange(item.field, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Home Address *</label>
                    <textarea value={form.address} onChange={(e) => handleChange('address', e.target.value)} rows={2}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                      <input type="text" value={form[item.field]}
                        onChange={(e) => handleChange(item.field, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Guarantor</h2>

                {isReturning && previousGuarantor && (
                  <div className="mb-4">
                    <div className="bg-gray-50 rounded-xl p-4 mb-4">
                      <p className="text-xs text-gray-500 mb-1">Previous Guarantor</p>
                      <p className="text-sm font-bold text-gray-800">{previousGuarantor.full_name}</p>
                      <p className="text-xs text-gray-500">{previousGuarantor.phone}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-3">What would you like to do with your guarantor?</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setKeepGuarantor(true)}
                        className="flex-1 py-2 rounded-xl text-sm font-bold border-2 transition"
                        style={keepGuarantor === true
                          ? { background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }
                          : { background: 'white', color: '#1e3a5f', borderColor: '#1e3a5f' }}
                      >
                        Keep Same Guarantor
                      </button>
                      <button
                        onClick={() => setKeepGuarantor(false)}
                        className="flex-1 py-2 rounded-xl text-sm font-bold border-2 transition"
                        style={keepGuarantor === false
                          ? { background: '#1e3a5f', color: 'white', borderColor: '#1e3a5f' }
                          : { background: 'white', color: '#1e3a5f', borderColor: '#1e3a5f' }}
                      >
                        Change Guarantor
                      </button>
                    </div>
                    {keepGuarantor === true && (
                      <div className="mt-3 bg-blue-50 rounded-xl p-3">
                        <p className="text-xs text-blue-700">✓ Your previous guarantor will receive a consent request for this new loan. They must approve before your application is reviewed.</p>
                      </div>
                    )}
                  </div>
                )}

                {(!isReturning || !previousGuarantor || keepGuarantor === false) && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500">Your guarantor will receive a separate link to complete their section.</p>
                    {[
                      { label: 'Guarantor Full Name *', field: 'guarantor_name', type: 'text' },
                      { label: 'Guarantor Phone *', field: 'guarantor_phone', type: 'tel' },
                      { label: 'Guarantor Email', field: 'guarantor_email', type: 'email' },
                    ].map(item => (
                      <div key={item.field}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                        <input type={item.type} value={form[item.field]}
                          onChange={(e) => handleChange(item.field, e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-6">
                <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
                  <p className="font-semibold text-gray-700">Terms and Conditions</p>
                  <p>Loan Interest Rate: <strong>{displayRate}%</strong> per month</p>
                  <p>Duration: <strong>{displayDuration} days</strong></p>
                  <p>Penalty for missed payment: <strong>{penaltyRate}%</strong> interest. A new <strong>{settings?.loan_duration_days ?? 30}-day</strong> term applies automatically.</p>
                  <p>Repayable to: <strong>{settings?.repayment_account_name}</strong> · {settings?.repayment_bank} · {settings?.repayment_account_no}</p>
                  <p>By submitting this form you agree to these terms.</p>
                </div>
              </div>

              <button onClick={handleSubmit} disabled={loading}
                className="w-full text-white py-3 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}>
                {loading ? 'Submitting...' : 'Submit Application'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}