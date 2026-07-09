import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const STATUS_LABELS = {
  pending: 'In wachtrij',
  sending: 'Bezig met versturen',
  sent: 'Verzonden',
  failed: 'Mislukt',
  suppressed: 'Gestopt',
}

const STATUS_COLORS = {
  pending: { bg: '#fff7e8', fg: '#8a571f' },
  sending: { bg: '#e3edfa', fg: '#1f4974' },
  sent: { bg: '#e8efe4', fg: '#2f5a31' },
  failed: { bg: '#fde2e2', fg: '#8a1f1f' },
  suppressed: { bg: '#eee', fg: '#666' },
}

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AdminMailSettings() {
  const [settings, setSettings] = useState({})
  const [outbox, setOutbox] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [testTo, setTestTo] = useState('')

  // E-mail export
  const [addrRole, setAddrRole] = useState('shopmanager')
  const [allAddresses, setAllAddresses] = useState([])

  const loadAllAddresses = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('mail_addresses_all')
      if (error) throw error
      setAllAddresses(data || [])
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Adressen ophalen mislukt.' })
    }
  }, [])

  useEffect(() => { loadAllAddresses() }, [loadAllAddresses])

  // Client-side filtering
  const addresses = addrRole
    ? allAddresses.filter((a) => a.role_name === addrRole)
    : allAddresses

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: s, error: e1 } = await supabase.rpc('get_app_settings')
      if (e1) throw e1
      const m = {}
      ;(s || []).forEach((r) => { m[r.key] = r.value })
      setSettings(m)

      const { data: o, error: e2 } = await supabase.rpc('mail_outbox_list', {
        p_status: statusFilter || null, p_limit: 100,
      })
      if (e2) throw e2
      setOutbox(o || [])
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || String(e) })
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function setSetting(key, value) {
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.rpc('set_app_setting', { p_key: key, p_value: value })
      if (error) throw error
      setSettings((prev) => ({ ...prev, [key]: value }))
      setMsg({ kind: 'good', text: 'Instelling bewaard.' })
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Bewaren mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    if (!testTo) return
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.rpc('mail_send_test', { p_to: testTo })
      if (error) throw error
      setMsg({ kind: 'good', text: `Testmail in de wachtrij gezet naar ${testTo}. Klik op "Nu verzenden" om hem te versturen.` })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Testmail kon niet aangemaakt worden.' })
    } finally {
      setBusy(false)
    }
  }

  async function triggerSend() {
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.rpc('mail_trigger_send')
      if (error) throw error
      setMsg({ kind: 'good', text: 'Verzending gestart. De wachtrij wordt over enkele seconden vernieuwd…' })
      setTimeout(() => { load() }, 4000)
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Verzending starten mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function retry(id) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('mail_outbox_retry', { p_id: id })
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Opnieuw plannen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function del(id) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('mail_outbox_delete', { p_id: id })
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Verwijderen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  const enabled = settings.mail_enabled === true

  if (loading) return <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>

  return (
    <>
      <div className="card">
        <div className="section-title">Mail-instellingen</div>

        <div className="row-item">
          <span>
            <strong>Verzending actief</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              Globale kill-switch — als deze uit staat blijven alle mails in de wachtrij staan.
            </div>
          </span>
          <button
            className={'sw' + (enabled ? ' on' : '')}
            disabled={busy}
            onClick={() => setSetting('mail_enabled', !enabled)}
            aria-label="Verzending actief"
          >
            <span className="knob" />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Testbericht versturen</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Maakt een testmail aan in de wachtrij. Daarna kun je hem onmiddellijk versturen via de knop "Nu verzenden" hieronder.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            type="email"
            value={testTo}
            placeholder="ontvanger e-mailadres"
            onChange={(e) => setTestTo(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy || !testTo} onClick={sendTest}>
            Testmail aanmaken
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Wachtrij ({outbox.length})</span>
          <button className="btn btn-primary" disabled={busy} onClick={triggerSend}>
            Nu verzenden
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {['', 'pending', 'sending', 'sent', 'failed'].map((s) => (
            <button
              key={s || 'all'}
              className={'btn' + (statusFilter === s ? ' btn-primary' : '')}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setStatusFilter(s)}
            >
              {s ? STATUS_LABELS[s] : 'Alle'}
            </button>
          ))}
        </div>

        {outbox.length === 0 ? (
          <div className="muted" style={{ padding: 12, textAlign: 'center' }}>Geen rijen.</div>
        ) : (
          <div style={{ marginTop: 10, padding: 0 }}>
            {outbox.map((r) => {
              const col = STATUS_COLORS[r.status] || STATUS_COLORS.pending
              return (
                <div key={r.id} style={{
                  borderTop: '1px solid var(--line)', padding: '8px 0',
                  display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.subject}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      → {r.to_email} · type: {r.kind} · {fmt(r.created_at)}
                      {r.sent_at && <> · verzonden {fmt(r.sent_at)}</>}
                      {r.attempts > 0 && <> · {r.attempts} pogingen</>}
                    </div>
                    {r.last_error && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
                        {r.last_error}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 8,
                      background: col.bg, color: col.fg, fontWeight: 500,
                    }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                    {(r.status === 'failed' || r.status === 'suppressed') && (
                      <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} disabled={busy} onClick={() => retry(r.id)}>
                        Opnieuw
                      </button>
                    )}
                    {['pending', 'failed', 'suppressed'].includes(r.status) && (
                      <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} disabled={busy} onClick={() => del(r.id)}>
                        Verwijderen
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">E-mailadressen exporteren</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Lijst van actieve medewerkers met een e-mailadres. Selecteer een rol en kopieer.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { v: 'shopmanager', l: 'Shopmanagers' },
            { v: 'flexi',       l: 'Flexi\'s' },
            { v: 'jobstudent',  l: 'Jobstudenten' },
            { v: 'ondernemer',  l: 'Ondernemers' },
            { v: '',            l: 'Alle' },
          ].map((r) => (
            <button
              key={r.v || 'all'}
              className={'btn' + (addrRole === r.v ? ' btn-primary' : '')}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setAddrRole(r.v)}
            >
              {r.l}
            </button>
          ))}
        </div>

        {addresses.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: 8 }}>Geen actieve medewerkers met e-mailadres voor deze rol.</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{addresses.length} adressen</div>
            <textarea
              readOnly
              style={{
                width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12,
                padding: 8, border: '1px solid var(--line)', borderRadius: 8, resize: 'vertical',
                background: 'var(--bg-soft, #f7f7f5)',
              }}
              value={addresses.map((a) => a.email).join('\n')}
              onFocus={(e) => e.target.select()}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(addresses.map((a) => a.email).join('\n'))
                  setMsg({ kind: 'good', text: `${addresses.length} adressen gekopieerd (één per regel).` })
                }}
              >
                Kopieer (één per regel)
              </button>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(addresses.map((a) => a.email).join(', '))
                  setMsg({ kind: 'good', text: `${addresses.length} adressen gekopieerd (komma-gescheiden).` })
                }}
              >
                Kopieer (komma)
              </button>
              <button
                className="btn"
                onClick={() => {
                  const txt = addresses.map((a) => `"${a.full_name}" <${a.email}>`).join(', ')
                  navigator.clipboard.writeText(txt)
                  setMsg({ kind: 'good', text: 'Adressen met naam gekopieerd (Outlook-formaat).' })
                }}
              >
                Kopieer met naam
              </button>
            </div>
          </>
        )}
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}
    </>
  )
}
