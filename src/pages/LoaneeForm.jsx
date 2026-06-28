import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoaneeForm() {
  const { token } = useParams()
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    address: '',
    occupation: '',
    bvn: '',
    nin: '',
    id_type: '',
    id_number: '',
    bank_name: '',
    account_number: '',
    account_name: '',
    guarantor_name: '',
    guarantor_phone: '',
    guarantor_email: '',
  })

  function handleChange(field, value) {
    setForm({ ...form, [field]: value })
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')

    try {
      const { data: application, error: appError } = await supabase
        .from('applications')
        .select('*, applicants(*)')
        .eq('loanee_token', token)
        .single()

      if (appError || !application) {
        setError('Invalid or expired application link.')
        setLoading(false)
        return
      }

      if (application.status !== 'pending_loanee') {
        setError('This application has already been submitted.')
        setLoading(false)
        return
      }

      let applicantId = null

      const { data: existing } = await supabase
        .from('applicants')
        .select('*')
        .or(`phone.eq.${form.phone},bvn.eq.${form.bvn}`)
        .not('full_name', 'eq', 'Pending')
        .maybeSingle()

      if (existing) {
        await supabase
          .from('applicants')
          .update({
            full_name: form.full_name,
            phone: form.phone,
            email: form.email,
            address: form.address,
            occupation: form.occupation,
            bvn: form.bvn,
            nin: form.nin,
            id_type: form.id_type,
            id_number: form.id_number,
            bank_name: form.bank_name,
            account_number: form.account_number,
            account_name: form.account_name,
          })
          .eq('id', existing.id)

        applicantId = existing.id

        await supabase
          .from('applicants')
          .delete()
          .eq('id', application.applicant_id)

      } else {
        await supabase
          .from('applicants')
          .update({
            full_name: form.full_name,
            phone: form.phone,
            email: form.email,
            address: form.address,
            occupation: form.occupation,
            bvn: form.bvn,
            nin: form.nin,
            id_type: form.id_type,
            id_number: form.id_number,
            bank_name: form.bank_name,
            account_number: form.account_number,
            account_name: form.account_name,
          })
          .eq('id', application.applicant_id)

        applicantId = application.applicant_id
      }

      const guarantorToken = crypto.randomUUID()

      const { data: guarantor, error: guarantorError } = await supabase
        .from('guarantors')
        .insert({
          applicant_id: applicantId,
          full_name: form.guarantor_name,
          phone: form.guarantor_phone,
          email: form.guarantor_email,
          relationship: '',
        })
        .select()
        .single()

      if (guarantorError) throw guarantorError

      await supabase
        .from('applications')
        .update({
          status: 'pending_guarantor',
          applicant_id: applicantId,
          guarantor_id: guarantor.id,
          guarantor_token: guarantorToken,
        })
        .eq('id', application.id)

      setSubmitted(true)

    } catch (err) {
      setError('Something went wrong. Please try again.')
      console.error(err)
    }

    setLoading(false)
  }

  if (submitted) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
        <div className="text-green-500 text-5xl mb-4">✓</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Application Submitted</h2>
        <p className="text-gray-500 text-sm">
          Your guarantor will receive a link to complete their section.
          You will be contacted once your application is reviewed.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-xl mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Gamma-lobo Enterprise</h1>
          <p className="text-gray-500 text-sm mt-1">Loan Application Form</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Personal Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Home Address *</label>
                <textarea
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Occupation *</label>
                <input
                  type="text"
                  value={form.occupation}
                  onChange={(e) => handleChange('occupation', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Identity Verification
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">BVN *</label>
                <input
                  type="text"
                  value={form.bvn}
                  onChange={(e) => handleChange('bvn', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIN *</label>
                <input
                  type="text"
                  value={form.nin}
                  onChange={(e) => handleChange('nin', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Type</label>
                <select
                  value={form.id_type}
                  onChange={(e) => handleChange('id_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select ID type</option>
                  <option value="nin_slip">NIN Slip</option>
                  <option value="passport">International Passport</option>
                  <option value="drivers_license">Driver's License</option>
                  <option value="voters_card">Voter's Card</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                <input
                  type="text"
                  value={form.id_number}
                  onChange={(e) => handleChange('id_number', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Disbursement Account
            </h2>
            <p className="text-xs text-gray-500 mb-4">Where should the loan be sent to?</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name *</label>
                <input
                  type="text"
                  value={form.bank_name}
                  onChange={(e) => handleChange('bank_name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
                <input
                  type="text"
                  value={form.account_number}
                  onChange={(e) => handleChange('account_number', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                <input
                  type="text"
                  value={form.account_name}
                  onChange={(e) => handleChange('account_name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Guarantor Information
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Your guarantor will receive a separate link to complete their section.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guarantor Full Name *</label>
                <input
                  type="text"
                  value={form.guarantor_name}
                  onChange={(e) => handleChange('guarantor_name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guarantor Phone *</label>
                <input
                  type="tel"
                  value={form.guarantor_phone}
                  onChange={(e) => handleChange('guarantor_phone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guarantor Email</label>
                <input
                  type="email"
                  value={form.guarantor_email}
                  onChange={(e) => handleChange('guarantor_email', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
              <p className="font-semibold text-gray-700">Terms and Conditions</p>
              <p>Interest rate: 18% per month</p>
              <p>Duration: 30 days</p>
              <p>Penalty for missed payment: 20% interest on outstanding balance, new 30-day term applies automatically.</p>
              <p>By submitting this form you agree to these terms.</p>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>

        </div>
      </div>
    </div>
  )
}