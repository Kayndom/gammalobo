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
    { to: '/dashboard', label: 'Dashboard', icon: '▦' },
    { to: '/applications', label: 'Applications', icon: '📋' },
    { to: '/loans', label: 'Loans', icon: '💰' },
    { to: '/loanees', label: 'Loanees', icon: '👥' },
    { to: '/settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen flex" style={{ background: '#f1f5f9' }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 flex flex-col
        transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ background: 'linear-gradient(180deg, #1e3a5f 0%, #162d4a 100%)' }}>

        {/* Logo */}
        <div className="p-6 border-b border-blue-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-lg"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e6c97a)' }}>
              G
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Gamma-lobo</h1>
              <p className="text-blue-300 text-xs">Loan Management</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-blue-300 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'text-white shadow-lg'
                    : 'text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10'
                }`
              }
              style={({ isActive }) => isActive ? {
                background: 'linear-gradient(135deg, #c9a84c, #e6c97a)',
                color: '#1e3a5f',
              } : {}}
            >
              <span className="text-base">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-blue-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10 transition"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile header */}
        <div className="lg:hidden px-4 py-3 flex items-center gap-3 shadow-sm"
          style={{ background: '#1e3a5f' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white text-xl"
          >
            ☰
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-sm"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e6c97a)' }}>
              G
            </div>
            <h1 className="text-white font-bold text-base">Gamma-lobo</h1>
          </div>
        </div>

        <div className="flex-1 p-4 lg:p-8 overflow-auto">
          {children}
        </div>
      </div>

    </div>
  )
}