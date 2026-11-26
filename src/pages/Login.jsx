import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'radial-gradient(ellipse at 50% 20%, #263744 0%, #17232d 46%, #101820 100%)' }}>
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-[58px] h-[58px] border border-white/45 mb-5">
            <span className="text-[29px] font-semibold tracking-[-.08em] text-white">R</span>
          </div>
          <p className="text-[11px] font-bold tracking-[.28em] text-slate-300">REGNUM</p>
          <p className="text-xs tracking-[.12em] text-slate-400 mt-2 uppercase">Ventures · Private workspace</p>
        </div>

        <section className="bg-white border border-white/70 rounded-xl shadow-[0_24px_80px_rgba(0,0,0,.24)] p-6 sm:p-9">
          <h1 className="text-[22px] font-bold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-slate-500 text-sm mb-7">Sign in to continue to your workspace.</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="regnum-email" className="block text-sm font-semibold text-slate-700 mb-2">Email address</label>
              <input
                id="regnum-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="w-full rounded-md border border-slate-300 px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="regnum-password" className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <input
                id="regnum-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3" role="alert">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1b2934] hover:bg-[#293b49] text-white py-3 rounded-md text-sm font-semibold tracking-wide transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>

        <p className="text-center text-slate-500 text-[11px] mt-6 tracking-wide">
          REGNUM VENTURES © {new Date().getFullYear()}
        </p>
      </div>
    </main>
  )
}
