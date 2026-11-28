import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Applications from './pages/Applications'
import Loans from './pages/Loans'
import Loanees from './pages/Loanees'
import Settings from './pages/Settings'
import Finance from './pages/Finance'
import Investors from './pages/Investors'
import AuditTrail from './pages/AuditTrail'
import LoaneeForm from './pages/LoaneeForm'
import GuarantorForm from './pages/GuarantorForm'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [introComplete, setIntroComplete] = useState(false)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setIntroComplete(true), reducedMotion ? 250 : 4200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  if (!introComplete || loading) return (
    <main className="regnum-intro min-h-screen flex items-center justify-center px-6" aria-label="REGNUM Ventures introduction">
      <div className="regnum-intro-content text-center">
        <div className="regnum-intro-mark mx-auto" aria-hidden="true">
          <span>R</span>
        </div>
        {window.location.pathname.startsWith('/apply/')
          ? <>
              <p className="regnum-intro-eyebrow mt-8">REGNUM VENTURES</p>
              <h1 className="regnum-intro-title mt-3">Your loan application starts here.</h1>
              <p className="regnum-intro-caption mt-4">Provide your details accurately and submit your application for review.</p>
            </>
          : window.location.pathname.startsWith('/guarantor/') || window.location.pathname.startsWith('/consent/')
            ? <>
                <p className="regnum-intro-eyebrow mt-8">REGNUM VENTURES</p>
                <h1 className="regnum-intro-title mt-3">Your confirmation matters.</h1>
                <p className="regnum-intro-caption mt-4">A borrower has nominated you as a guarantor. Please review the information carefully before deciding whether to proceed.</p>
              </>
            : <>
                <p className="regnum-intro-eyebrow mt-8">REGNUM MANAGEMENT</p>
                <h1 className="regnum-intro-title mt-3">LOAN MANAGEMENT SYSTEM (LMS)</h1>
                <p className="regnum-intro-caption mt-4">Smarter loan management. Clearer financial records. Better business control.</p>
              </>}
        <div className="regnum-intro-progress mt-10" aria-hidden="true"><span /></div>
        {introComplete
          ? <p className="regnum-intro-caption mt-4" role="status">Preparing your workspace…</p>
          : <button type="button" className="regnum-intro-skip mt-8" onClick={() => setIntroComplete(true)}>Skip introduction</button>}
      </div>
      <span className="regnum-intro-footer">PRIVATE WORKSPACE <span>·</span> {new Date().getFullYear()}</span>
    </main>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/apply/:token" element={<LoaneeForm />} />
        <Route path="/guarantor/:token" element={<GuarantorForm />} />
        <Route path="/consent/:token" element={<GuarantorForm />} />
        <Route path="/" element={session ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/dashboard" element={session ? <Dashboard /> : <Navigate to="/" />} />
        <Route path="/applications" element={session ? <Applications /> : <Navigate to="/" />} />
        <Route path="/loans" element={session ? <Loans /> : <Navigate to="/" />} />
        <Route path="/loanees" element={session ? <Loanees /> : <Navigate to="/" />} />
        <Route path="/finance" element={session ? <Finance /> : <Navigate to="/" />} />
        <Route path="/investors" element={session ? <Investors /> : <Navigate to="/" />} />
        <Route path="/settings" element={session ? <Settings /> : <Navigate to="/" />} />
        <Route path="/audit" element={session ? <AuditTrail /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App