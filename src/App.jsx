import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login.jsx'
import Shell from './Shell.jsx'
import Placeholder from './Placeholder.jsx'
import OndernemerCalendar from './OndernemerCalendar.jsx'
import WorkerCalendar from './WorkerCalendar.jsx'
import ShopmanagerHome from './ShopmanagerHome.jsx'
import AdminHome from './AdminHome.jsx'
import BoekhoudingHome from './BoekhoudingHome.jsx'
import SetPassword from './SetPassword.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [employee, setEmployee] = useState(undefined) // undefined = laden, null = niet gevonden
  // Detecteer invite/recovery-link VOORDAT Supabase de URL leegt
  const [inviteMode, setInviteMode] = useState(() => {
    const h = (typeof window !== 'undefined' && window.location.hash) || ''
    const q = (typeof window !== 'undefined' && window.location.search) || ''
    return /type=(invite|recovery)/.test(h) || /type=(invite|recovery)/.test(q)
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || inviteMode) {
      setEmployee(undefined)
      return
    }
    let active = true
    ;(async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()
      if (active) setEmployee(error ? null : data)
    })()
    return () => {
      active = false
    }
  }, [session, inviteMode])

  const logout = () => supabase.auth.signOut()

  if (!authReady) return <div className="center muted">Laden…</div>
  if (inviteMode && session) {
    return (
      <SetPassword
        email={session.user?.email}
        onDone={() => {
          setInviteMode(false)
          try { window.history.replaceState({}, '', window.location.pathname) } catch (_) {}
        }}
      />
    )
  }
  if (!session) return <Login />
  if (employee === undefined) return <div className="center muted">Profiel laden…</div>
  if (!employee) {
    return (
      <Shell employee={null} onLogout={logout}>
        <div className="card" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <h2 style={{ marginBottom: 8 }}>Geen profiel gekoppeld</h2>
          <p className="muted">
            Er is nog geen medewerker gekoppeld aan <strong>{session.user.email}</strong>. Vraag de admin om je
            account te koppelen.
          </p>
        </div>
      </Shell>
    )
  }
  if (employee.must_change_password) {
    return (
      <SetPassword
        email={session.user?.email}
        onDone={async () => {
          try { await supabase.rpc('mark_password_set') } catch (_) {}
          setEmployee((e) => (e ? { ...e, must_change_password: false } : e))
        }}
      />
    )
  }

  if (employee.role === 'ondernemer') {
    return <OndernemerCalendar employee={employee} onLogout={logout} />
  }
  if (employee.role === 'flexi' || employee.role === 'jobstudent') {
    return <WorkerCalendar employee={employee} onLogout={logout} />
  }
  if (employee.role === 'shopmanager') {
    return <ShopmanagerHome employee={employee} onLogout={logout} />
  }
  if (employee.role === 'admin') {
    return <AdminHome employee={employee} onLogout={logout} />
  }
  if (employee.role === 'boekhouding') {
    return <BoekhoudingHome employee={employee} onLogout={logout} />
  }
  return <Placeholder employee={employee} onLogout={logout} />
}
