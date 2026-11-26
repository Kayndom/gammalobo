import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function MainLayout({ children }) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: '01' },
    { to: '/applications', label: 'Applications', icon: '02' },
    { to: '/loans', label: 'Loans', icon: '03' },
    { to: '/loanees', label: 'Borrowers', icon: '04' },
    { to: '/finance', label: 'Finance', icon: '05' },
    { to: '/investors', label: 'Investors', icon: '06' },
    { to: '/settings', label: 'Settings', icon: '07' },
  ]

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--page-bg)' }}>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 bg-slate-950/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:sticky inset-y-0 left-0 z-30 w-[250px] shrink-0 flex flex-col
        bg-[var(--sidebar-bg)] text-white
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ height: '100dvh' }}>
        <div className="h-[76px] px-6 flex items-center border-b border-white/10">
          <div className="w-9 h-9 border border-white/35 flex items-center justify-center text-white font-bold text-lg mr-3">R</div>
          <div>
            <div className="font-bold tracking-[.12em] text-[15px]">REGNUM</div>
            <div className="text-[10px] tracking-[.13em] uppercase text-slate-400">Ventures</div>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-300 text-xl" aria-label="Close menu">×</button>
        </div>

        <div className="px-6 pt-7 pb-3 text-[10px] font-bold tracking-[.16em] uppercase text-slate-500">Workspace</div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-3 text-[13px] rounded-md transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-slate-300 hover:bg-white/[.06] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-slate-200 rounded-r" />}
                  <span className="w-6 text-[10px] font-semibold tracking-wide text-slate-500">{link.icon}</span>
                  <span>{link.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-[13px] text-slate-300 hover:text-white hover:bg-white/[.06] transition-colors"
          >
            <span className="w-6 text-center text-slate-500">↗</span>
            <span>Sign out</span>
          </button>
          <div className="px-3 pt-2 text-[10px] text-slate-500">REGNUM VENTURES · ADMIN</div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-10 h-14 px-4 flex items-center gap-3 bg-white border-b border-[var(--border)]">
          <button type="button" onClick={() => setSidebarOpen(true)} className="w-9 h-9 border border-[var(--border)] rounded-md text-slate-700" aria-label="Open menu">☰</button>
          <div className="font-bold tracking-[.12em] text-sm text-slate-800">REGNUM <span className="font-normal tracking-normal text-slate-500">Ventures</span></div>
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 xl:p-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
