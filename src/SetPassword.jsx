import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function SetPassword({ email, onDone }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (pw.length < 8) { setErr('Wachtwoord moet minstens 8 tekens lang zijn.'); return }
    if (pw !== pw2) { setErr('De twee wachtwoorden komen niet overeen.'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      onDone?.()
    } catch (e) {
      setErr(e?.message || 'Instellen mislukt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center" style={{ padding: 24 }}>
      <div className="card" style={{ maxWidth: 360, width: '100%' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Welkom bij Loqual</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {email
            ? <>Stel een wachtwoord in voor <strong>{email}</strong> om verder te gaan.</>
            : <>Stel een wachtwoord in om verder te gaan.</>}
        </p>
        <form onSubmit={submit}>
          <label className="flbl">Nieuw wachtwoord</label>
          <input
            className="input fw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            disabled={busy}
            required
          />
          <label className="flbl" style={{ marginTop: 10 }}>Wachtwoord opnieuw</label>
          <input
            className="input fw"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            disabled={busy}
            required
          />
          {err && <div className="msg err" style={{ marginTop: 10 }}>{err}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 14 }}>
            {busy ? 'Bezig…' : 'Wachtwoord instellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
