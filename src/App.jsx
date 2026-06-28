import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Applications from './pages/Applications'
import Loans from './pages/Loans'
import Loanees from './pages/Loanees'
import Settings from './pages/Settings'
import LoaneeForm from './pages/LoaneeForm'
import GuarantorForm from './pages/GuarantorForm'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - no login needed */}
        <Route path="/apply/:token" element={<LoaneeForm />} />
        <Route path="/guarantor/:token" element={<GuarantorForm />} />

        {/* Protected routes */}
        <Route path="/" element={session ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/dashboard" element={session ? <Dashboard /> : <Navigate to="/" />} />
        <Route path="/applications" element={session ? <Applications /> : <Navigate to="/" />} />
        <Route path="/loans" element={session ? <Loans /> : <Navigate to="/" />} />
        <Route path="/loanees" element={session ? <Loanees /> : <Navigate to="/" />} />
        <Route path="/settings" element={session ? <Settings /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App