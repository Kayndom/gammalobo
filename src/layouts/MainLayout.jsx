import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function MainLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('regnum-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' } })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('regnum-theme', theme) } catch {}
  }, [theme])

  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadNotifications() {
      const today = new Date()
      const todayKey = today.toISOString().slice(0, 10)
      const inSevenDays = new Date(today)
      inSevenDays.setDate(inSevenDays.getDate() + 7)
      const inFourteenDays = new Date(today)
      inFourteenDays.setDate(inFourteenDays.getDate() + 14)
      await supabase.rpc('check_overdue_loans')
      const [overdueResult, dueSoonResult, applicationResult, maturityResult] = await Promise.all([
        supabase.from('loans').select('id,due_date,applicants(full_name)').eq('status', 'overdue').order('due_date', { ascending: true }),
        supabase.from('loans').select('id,due_date,applicants(full_name)').eq('status', 'active').gte('due_date', todayKey).lte('due_date', inSevenDays.toISOString().slice(0, 10)).order('due_date', { ascending: true }),
        supabase.from('applications').select('id,status,created_at,applicants(full_name)').in('status', ['pending_loanee', 'pending_guarantor', 'pending_review']).order('created_at', { ascending: true }),
        supabase.from('investments').select('id,maturity_date,investors(full_name)').eq('status', 'active').lte('maturity_date', inFourteenDays.toISOString().slice(0, 10)).order('maturity_date', { ascending: true }),
      ])
      if (!mounted) return
      const items = []
      ;(overdueResult.data || []).forEach(loan => items.push({ id: 'overdue-' + loan.id, title: 'Overdue loan', detail: loan.applicants?.full_name || 'Borrower record', date: loan.due_date, route: '/loans', priority: 'urgent' }))
      ;(dueSoonResult.data || []).forEach(loan => items.push({ id: 'due-' + loan.id, title: 'Loan due soon', detail: (loan.applicants?.full_name || 'Borrower') + ' · due ' + new Date(loan.due_date).toLocaleDateString('en-NG'), date: loan.due_date, route: '/loans', priority: 'normal' }))
      ;(applicationResult.data || []).forEach(app => items.push({ id: 'application-' + app.id, title: app.status === 'pending_review' ? 'Application needs review' : app.status === 'pending_guarantor' ? 'Awaiting guarantor' : 'Awaiting applicant', detail: app.applicants?.full_name || 'Application record', date: app.created_at, route: '/applications', priority: app.status === 'pending_review' ? 'important' : 'normal' }))
      ;(maturityResult.data || []).forEach(deal => items.push({ id: 'maturity-' + deal.id, title: deal.maturity_date < todayKey ? 'Investment maturity date passed' : 'Investment nearing maturity', detail: (deal.investors?.full_name || 'Investor') + ' · ' + new Date(deal.maturity_date).toLocaleDateString('en-NG'), date: deal.maturity_date, route: '/investors', priority: 'important' }))
      const rank = { urgent: 0, important: 1, normal: 2 }
      items.sort((a, b) => rank[a.priority] - rank[b.priority] || new Date(a.date || 0) - new Date(b.date || 0))
      setNotifications(items)
      setNotificationsLoading(false)
    }
    loadNotifications()
    return () => { mounted = false }
  }, [])

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
    { to: '/audit', label: 'Audit trail', icon: '08' },
  ]

  const activePage = navLinks.find(link => location.pathname === link.to)

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--page-bg)' }}>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px] z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:sticky inset-y-0 left-0 z-30 w-[250px] shrink-0 flex flex-col
        bg-[var(--sidebar-bg)] text-white
        transform transition-transform duration-300 ease-out
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
        <header className="sticky top-0 z-20 h-14 px-4 sm:px-6 flex items-center gap-3 bg-white border-b border-[var(--border)]">
          <button type="button" onClick={() => setSidebarOpen(true)} className="w-9 h-9 border border-[var(--border)] rounded-md text-slate-700 hover:bg-slate-50 transition-colors lg:hidden" aria-label="Open menu">☰</button>
          <div className="font-bold tracking-[.12em] text-sm text-slate-800 lg:hidden">REGNUM <span className="font-normal tracking-normal text-slate-500">Ventures</span></div>
          <div className="hidden lg:flex flex-col justify-center min-w-0"><span className="text-sm font-semibold text-slate-800">{activePage?.label || 'Business workspace'}</span><span className="text-[11px] text-slate-400">REGNUM VENTURES · ADMIN WORKSPACE</span></div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'} aria-pressed={theme === 'dark'} className="h-10 px-3 flex items-center gap-2 rounded-md border border-[var(--border)] text-slate-700 hover:bg-slate-50 text-xs font-semibold"><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><span className="hidden sm:inline">{theme === 'dark' ? 'Day mode' : 'Night mode'}</span></button>
            <div className="relative">
            <button type="button" onClick={() => setNotificationsOpen(v => !v)} aria-label={'Notifications, ' + notifications.length + ' items'} aria-expanded={notificationsOpen} className="relative w-10 h-10 flex items-center justify-center rounded-md border border-[var(--border)] text-slate-700 hover:bg-slate-50">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
              {notifications.length > 0 && <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{notifications.length > 99 ? '99+' : notifications.length}</span>}
            </button>
            {notificationsOpen && <div className="fixed sm:absolute top-[60px] sm:top-12 left-3 right-3 sm:left-auto sm:right-0 sm:w-[370px] max-h-[75dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl z-50">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between"><div><p className="font-bold text-slate-900 text-sm">Notifications & reminders</p><p className="text-xs text-slate-500 mt-0.5">Items that may need your attention</p></div><button type="button" onClick={() => setNotificationsOpen(false)} className="w-8 h-8 rounded-md border text-slate-500" aria-label="Close notifications">×</button></div>
              {notificationsLoading ? <p className="p-5 text-sm text-slate-500">Checking your records…</p> : notifications.length === 0 ? <div className="p-6 text-center"><p className="text-sm font-semibold text-slate-700">You're all caught up</p><p className="text-xs text-slate-500 mt-1">No overdue loans, upcoming due dates or pending reminders.</p></div> : <div className="divide-y divide-slate-100">{notifications.map(item => <button key={item.id} type="button" onClick={() => { setNotificationsOpen(false); navigate(item.route) }} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3 items-start"><span className={'mt-1 w-2 h-2 rounded-full shrink-0 ' + (item.priority === 'urgent' ? 'bg-red-500' : item.priority === 'important' ? 'bg-amber-500' : 'bg-slate-400')}></span><span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{item.title}</span><span className="block text-xs text-slate-500 mt-0.5">{item.detail}</span></span><span className="ml-auto text-xs text-slate-400 shrink-0">View</span></button>)}</div>}
              <div className="px-4 py-2 border-t border-slate-200 text-[11px] text-slate-400">Updates when you open the workspace. Check the relevant section for full records.</div>
            </div>}
          </div>
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 xl:p-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
