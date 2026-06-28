import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function GuarantorForm() {
  const { token } = useParams()
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    address: '',
    occupation: '',
    bvn: '',
    nin: '',
    id_type: '',
    id_number: '',
    relationship: '',
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
        .select('*, guarantors(*)')
        .eq('guarantor_token', token)
        .single()

      if (appError || !application) {
        setError('Invalid or expired guarantor link.')
        setLoading(false)
        return
      }

      if (application.status !== 'pending_guarantor') {
        setError('This guarantor form has already been submitted.')
        setLoading(false)
        return
      }

      const { error: guarantorError } = await supabase
        .from('guarantors')
        .update({
          address: form.address,
          occupation: form.occupation,
          bvn: form.bvn,
          nin: form.nin,
          id_type: form.id_type,
          id_number: form.id_number,
          relationship: form.relationship,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', application.guarantor_id)

      if (guarantorError) throw guarantorError

      const { error: updateError } = await supabase
        .from('applications')
        .update({ status: 'pending_review' })
        .eq('id', application.id)

      if (updateError) throw updateError

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
        <h2 className="text-xl font-bold text-gray-800 mb-2">Thank You</h2>
        <p className="text-gray-500 text-sm">
          Your guarantor information has been submitted successfully.
          The loan application is now under review.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-xl mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Gamma-lobo Enterprise</h1>
          <p className="text-gray-500 text-sm mt-1">Guarantor Form</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">

          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
            You have been listed as a guarantor for a loan application.
            Please complete your details below.
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Your Details
            </h2>
            <div className="space-y-4">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship to Applicant *</label>
                <input
                  type="text"
                  value={form.relationship}
                  onChange={(e) => handleChange('relationship', e.target.value)}
                  placeholder="e.g. Brother, Colleague, Friend"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
              <p className="font-semibold text-gray-700">Guarantor Agreement</p>
              <p>By submitting this form, you confirm that you are aware of the loan application and agree to stand as guarantor. In the event of default, legal action may be taken and collateral equivalent to the outstanding amount may be claimed.</p>
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
            {loading ? 'Submitting...' : 'Submit Guarantor Form'}
          </button>

        </div>
      </div>
    </div>
  )
}