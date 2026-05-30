import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr('Aanmelden mislukt. Controleer je e-mail en wachtwoord.')
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          Loqual<span style={{ color: 'var(--clay)' }}>.</span>
        </h1>
        <p className="sub">Planning voor lokale ondernemers</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>E-mailadres</label>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Wachtwoord</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {err && <div className="msg err">{err}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? 'Bezig…' : 'Aanmelden'}
          </button>
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => alert('Contacteer je shopmanager of de Loqual-administrator om je wachtwoord te laten resetten. Je krijgt dan een tijdelijk wachtwoord waarmee je kan aanmelden en meteen een nieuw wachtwoord instellen.')}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--muted, #6b6b6b)', textDecoration: 'underline',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Wachtwoord vergeten?
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
