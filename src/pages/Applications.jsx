import { useState, useEffect } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

function ActiveLoanWarning({ applicantId }) {
  const [hasActive, setHasActive] = useState(false)

  useEffect(() => {
    async function check() {
      const { data } = await supabase
        .from('loans')
        .select('id')
        .eq('applicant_id', applicantId)
        .eq('status', 'active')
        .maybeSingle()
      if (data) setHasActive(true)
    }
    check()
  }, [applicantId])

  if (!hasActive) return null

  return (
    <p className="text-xs text-orange-500 font-medium mt-1">
      ⚠️ This loanee has an active loan
    </p>
  )
}

export default function Applications() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newLink, setNewLink] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [showNewLink, setShowNewLink] = useState(false)
  const [copiedLink, setCopiedLink] = useState('')
  const [search, setSearch] = useState('')
  const [customRate, setCustomRate] = useState('')
  const [customDuration, setCustomDuration] = useState('')

  useEffect(() => {
    fetchApplications()
  }, [])

  async function fetchApplications() {
    const { data } = await supabase
      .from('applications')
      .select(`*, applicants(*), guarantors(*)`)
      .order('created_at', { ascending: false })
    if (data) setApplications(data)
    setLoading(false)
  }

  function getWhatsAppLink(app) {
    const rawPhone = app.guarantors?.phone || ''
    const phone = rawPhone.startsWith('0') ? '234' + rawPhone.slice(1) : rawPhone
    const message = `Hello ${app.guarantors?.full_name}, you have been listed as a guarantor for a loan application on Regnum Ventures. Please complete your guarantor form here: ${window.location.origin}/guarantor/${app.guarantor_token}`
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
  }

  async function generateApplicationLink() {
    if (!loanAmount) return
    setGenerating(true)
    try {
      const { data: applicant, error: applicantError } = await supabase
        .from('applicants')
        .insert({ full_name: 'Pending', phone: 'Pending' })
        .select()
        .single()
      if (applicantError) throw applicantError
      const loaneeToken = crypto.randomUUID()
      const { error: appError } = await supabase
        .from('applications')
        .insert({
          applicant_id: applicant.id,
          loan_amount_requested: parseFloat(loanAmount.replace(/,/g, '')),
          status: 'pending_loanee',
          loanee_token: loaneeToken,
          custom_interest_rate: customRate ? parseFloat(customRate) : null,
          custom_duration_days: customDuration ? parseInt(customDuration) : null,
        })
      if (appError) throw appError
      const link = `${window.location.origin}/apply/${loaneeToken}`
      setNewLink(link)
      setShowNewLink(true)
      setLoanAmount('')
      setCustomRate('')
      setCustomDuration('')
      fetchApplications()
    } catch (err) {
      console.error(err)
    }
    setGenerating(false)
  }

  async function updateStatus(id, status, rejectionReason = null) {
    const update = { status, reviewed_at: new Date().toISOString() }
    if (rejectionReason) update.rejection_reason = rejectionReason
    await supabase.from('applications').update(update).eq('id', id)
    fetchApplications()
  }

  function copyLink(link) {
    navigator.clipboard.writeText(link)
    setCopiedLink(link)
    setTimeout(() => setCopiedLink(''), 2000)
  }

  function getStatusBadge(status) {
    const styles = {
      pending_loanee: 'bg-yellow-100 text-yellow-700',
      pending_guarantor: 'bg-blue-100 text-blue-700',
      pending_review: 'bg-purple-100 text-purple-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    }
    const labels = {
      pending_loanee: 'Awaiting Loanee',
      pending_guarantor: 'Awaiting Guarantor',
      pending_review: 'Pending Review',
      approved: 'Approved',
      rejected: 'Rejected',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Applications</h1>
            <p className="text-gray-500 text-sm">Generate links and manage loan applications</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Generate New Application Link</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Enter loan amount e.g. 120,000"
              value={loanAmount}
              onChange={(e) => {
                const raw = e.target.value.replace(/,/g, '')
                if (!isNaN(raw) || raw === '') {
                  setLoanAmount(raw === '' ? '' : Number(raw).toLocaleString())
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Custom Interest Rate (%) — leave blank for default
                </label>
                <input
                  type="number"
                  placeholder="e.g. 15"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Custom Duration (days) — leave blank for default
                </label>
                <input
                  type="number"
                  placeholder="e.g. 30"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={generateApplicationLink}
              disabled={generating || !loanAmount}
              className="w-full text-white px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5282)' }}
            >
              {generating ? 'Generating...' : 'Generate Link'}
            </button>
          </div>

          {showNewLink && newLink && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <p className="text-sm font-medium text-green-700 mb-2">
                Application link generated. Send this to the loanee:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLink}
                  readOnly
                  className="flex-1 border border-green-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
                <button
                  onClick={() => copyLink(newLink)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition"
                >
                  {copiedLink === newLink ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">All Applications</h2>
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
          ) : applications.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No applications yet</div>
          ) : (
            <div className="divide-y">
              {applications.filter(app =>
                app.applicants?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                app.applicants?.phone?.includes(search)
              ).map((app) => (
                <div key={app.id} className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-gray-800">
                          {app.applicants?.full_name === 'Pending'
                            ? 'Awaiting applicant...'
                            : app.applicants?.full_name}
                        </p>
                        {getStatusBadge(app.status)}
                      </div>
                      <p className="text-sm text-gray-500">
                        Loan Amount: <span className="font-medium text-gray-700">
                          ₦{Number(app.loan_amount_requested).toLocaleString()}
                        </span>
                      </p>
                      {app.custom_interest_rate && (
                        <p className="text-sm text-gray-500">
                          Custom Rate: <span className="font-medium text-orange-600">{app.custom_interest_rate}%</span>
                        </p>
                      )}
                      {app.custom_duration_days && (
                        <p className="text-sm text-gray-500">
                          Custom Duration: <span className="font-medium text-orange-600">{app.custom_duration_days} days</span>
                        </p>
                      )}
                      {app.applicants?.phone !== 'Pending' && (
                        <p className="text-sm text-gray-500">Phone: {app.applicants?.phone}</p>
                      )}
                      {app.guarantors && (
                        <p className="text-sm text-gray-500">Guarantor: {app.guarantors?.full_name}</p>
                      )}
                      {app.status === 'pending_review' && app.applicants?.full_name !== 'Pending' && (
                        <ActiveLoanWarning applicantId={app.applicant_id} />
                      )}
                      {app.rejection_reason && (
                        <p className="text-xs text-red-500">Reason: {app.rejection_reason}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        {new Date(app.created_at).toLocaleDateString('en-NG', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      {app.status === 'pending_loanee' && (
                        <button
                          onClick={() => copyLink(`${window.location.origin}/apply/${app.loanee_token}`)}
                          className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-200 transition"
                        >
                          {copiedLink === `${window.location.origin}/apply/${app.loanee_token}`
                            ? 'Copied!' : 'Copy Loanee Link'}
                        </button>
                      )}
                      {app.status === 'pending_guarantor' && app.guarantor_token && (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => copyLink(`${window.location.origin}/guarantor/${app.guarantor_token}`)}
                            className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 transition"
                          >
                            {copiedLink === `${window.location.origin}/guarantor/${app.guarantor_token}`
                              ? 'Copied!' : 'Copy Guarantor Link'}
                          </button>
                          
                            < a href={getWhatsAppLink(app)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 transition text-center"
                          >
                            Send via WhatsApp
                          </a>
                        </div>
                      )}
                      {app.status === 'pending_review' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateStatus(app.id, 'approved')}
                            className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const reason = prompt('Reason for rejection?')
                              if (reason) updateStatus(app.id, 'rejected', reason)
                            }}
                            className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {app.status === 'rejected' && (
                        <button
                          onClick={() => updateStatus(app.id, 'pending_review')}
                          className="text-xs bg-gray-500 text-white px-3 py-1 rounded-lg hover:bg-gray-600 transition"
                        >
                          Reconsider
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </MainLayout>
  )
}