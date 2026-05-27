import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login.jsx'
import Shell from './Shell.jsx'
import Placeholder from './Placeholder.jsx'
import OndernemerCalendar from './OndernemerCalendar.jsx'
import WorkerCalendar from './WorkerCalendar.jsx'
import ShopmanagerPlanning from './ShopmanagerPlanning.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [employee, setEmployee] = useState(undefined) // undefined = laden, null = niet gevonden

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
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
  }, [session])

  const logout = () => supabase.auth.signOut()

  if (!authReady) return <div className="center muted">Laden…</div>
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

  if (employee.role === 'ondernemer') {
    return <OndernemerCalendar employee={employee} onLogout={logout} />
  }
  if (employee.role === 'flexi' || employee.role === 'jobstudent') {
    return <WorkerCalendar employee={employee} onLogout={logout} />
  }
  if (employee.role === 'shopmanager') {
    return <ShopmanagerPlanning employee={employee} onLogout={logout} />
  }
  return <Placeholder employee={employee} onLogout={logout} />
}
