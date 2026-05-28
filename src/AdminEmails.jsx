import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

export default function AdminEmails() {
  const [section, setSection] = useState('templates') // 'templates' | 'shops'

  return (
    <>
      <div className="pills" style={{ marginBottom: 12 }}>
        <button className={'pill' + (section === 'templates' ? ' active' : '')} onClick={() => setSection('templates')}>
          Sjablonen
        </button>
        <button className={'pill' + (section === 'shops' ? ' active' : '')} onClick={() => setSection('shops')}>
          Per winkel
        </button>
      </div>
      {section === 'templates' ? <Templates /> : <ShopMail />}
    </>
  )
}

// ---------------------------------------------------------------------------
function Templates() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null) // null | {type, subject, body, placeholders, description}
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('notification_templates')
      .select('type, description, subject, body, placeholders, updated_at')
      .order('type')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!editing.subject.trim() || !editing.body.trim()) {
      setMsg({ kind: 'err', text: 'Onderwerp en bericht zijn verplicht.' })
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase
        .from('notification_templates')
        .update({ subject: editing.subject, body: editing.body })
        .eq('type', editing.type)
      if (error) throw error
      setEditing(null)
      await load()
      setMsg({ kind: 'good', text: 'Sjabloon bewaard.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bewaren mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="section-title">Mailsjablonen</div>
      <div className="hint" style={{ marginTop: 0 }}>
        Tussen accolades, zoals <code>{'{maand}'}</code> of <code>{'{winkel}'}</code>, staan plekken die automatisch worden
        ingevuld bij verzenden. Je ziet bij elk sjabloon welke variabelen beschikbaar zijn.
      </div>
      {loading ? (
        <div className="muted">Laden…</div>
      ) : (
        rows.map((r) => (
          <div className="row-item" key={r.type}>
            <span style={{ minWidth: 0 }}>
              <strong>{prettyType(r.type)}</strong>
              {r.description && <div className="muted" style={{ fontSize: 13 }}>{r.description}</div>}
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Onderwerp: <em>{r.subject}</em>
              </div>
            </span>
            <button
              className="btn" style={{ padding: '6px 12px', fontSize: 13 }}
              onClick={() => { setEditing({ ...r }); setMsg(null) }}
            >
              Bewerken
            </button>
          </div>
        ))
      )}

      {msg && !editing && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`} style={{ marginTop: 8 }}>{msg.text}</div>}

      {editing && (
        <div style={ovl} onClick={() => setEditing(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>{prettyType(editing.type)}</h3>
            {editing.description && <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{editing.description}</p>}
            <label className="flbl">Onderwerp</label>
            <input className="input fw" value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            <label className="flbl" style={{ marginTop: 10 }}>Bericht</label>
            <textarea
              className="input fw" style={{ minHeight: 180, fontFamily: 'inherit' }}
              value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
            {editing.placeholders && (
              <div className="hint" style={{ marginBottom: 0 }}>
                Beschikbare variabelen: <code>{editing.placeholders}</code>
              </div>
            )}
            {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setEditing(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Bezig…' : 'Bewaren'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function prettyType(t) {
  return ({
    availability_missing: 'Herinnering: nog geen beschikbaarheden',
    shift_reminder: 'Herinnering vóór een uitbatingsdag',
    schedule_published: 'Planning gepubliceerd',
    schedule_confirmed: 'Planning bevestigd (naar admin)',
  })[t] || t
}

// ---------------------------------------------------------------------------
function ShopMail() {
  const [shops, setShops] = useState([])
  const [settings, setSettings] = useState({}) // shop_id -> row
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null) // null | {shop, form}
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sh }, { data: se }] = await Promise.all([
      supabase.from('shops').select('id, name, active').order('name'),
      supabase.from('shop_email_settings').select('*'),
    ])
    setShops(sh || [])
    const map = {}
    ;(se || []).forEach((row) => { map[row.shop_id] = row })
    setSettings(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit(shop) {
    const cur = settings[shop.id]
    setEditing({
      shop,
      form: {
        from_name: cur?.from_name || '',
        from_email: cur?.from_email || '',
        reply_to: cur?.reply_to || '',
        smtp_host: cur?.smtp_host || 'smtp.gmail.com',
        smtp_port: cur?.smtp_port || 465,
        smtp_user: cur?.smtp_user || '',
        smtp_password: cur?.smtp_password || '',
        active: cur?.active ?? true,
      },
    })
    setMsg(null)
  }

  async function save() {
    const { shop, form } = editing
    if (!form.from_email.trim() || !form.smtp_user.trim() || !form.smtp_password.trim()) {
      setMsg({ kind: 'err', text: 'Afzender, SMTP-gebruiker en app-wachtwoord zijn verplicht.' })
      return
    }
    setBusy(true)
    try {
      const payload = {
        shop_id: shop.id,
        from_name: form.from_name.trim() || null,
        from_email: form.from_email.trim(),
        reply_to: form.reply_to.trim() || null,
        smtp_host: form.smtp_host.trim() || 'smtp.gmail.com',
        smtp_port: Number(form.smtp_port) || 465,
        smtp_user: form.smtp_user.trim(),
        smtp_password: form.smtp_password,
        active: !!form.active,
      }
      const { error } = await supabase.from('shop_email_settings').upsert(payload, { onConflict: 'shop_id' })
      if (error) throw error
      setEditing(null)
      await load()
      setMsg({ kind: 'good', text: 'Mailinstellingen bewaard.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bewaren mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="section-title">Mailverzending per winkel</div>
      <div className="hint" style={{ marginTop: 0 }}>
        Vul per winkel het afzendadres en het Gmail-app-wachtwoord in. Mails naar medewerkers vertrekken vanuit dit
        adres, met hetzelfde adres als reply-to. Voor Gmail/Google Workspace heb je 2-staps-verificatie nodig en een
        app-wachtwoord (Account → Beveiliging → App-wachtwoorden).
      </div>
      {loading ? (
        <div className="muted">Laden…</div>
      ) : shops.length === 0 ? (
        <div className="muted">Maak eerst winkels aan.</div>
      ) : (
        shops.map((s) => {
          const cur = settings[s.id]
          return (
            <div className="row-item" key={s.id}>
              <span style={{ minWidth: 0 }}>
                <strong>{s.name}</strong>
                {!s.active && <span className="tag niet" style={{ marginLeft: 8 }}>winkel niet actief</span>}
                <div className="muted" style={{ fontSize: 13 }}>
                  {cur
                    ? <>Afzender: <code>{cur.from_email}</code>{!cur.active && ' · verzending uitgeschakeld'}</>
                    : 'Nog niet ingesteld'}
                </div>
              </span>
              <button className="btn" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => openEdit(s)}>
                {cur ? 'Bewerken' : 'Instellen'}
              </button>
            </div>
          )
        })
      )}

      {msg && !editing && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`} style={{ marginTop: 8 }}>{msg.text}</div>}

      {editing && (
        <div style={ovl} onClick={() => setEditing(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 14 }}>{editing.shop.name} — mailinstellingen</h3>

            <label className="flbl">Afzendernaam (optioneel)</label>
            <input className="input fw" placeholder={`Loqual ${editing.shop.name}`}
              value={editing.form.from_name}
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, from_name: e.target.value } })} />

            <label className="flbl" style={{ marginTop: 10 }}>Afzenderadres</label>
            <input className="input fw" type="email" placeholder={`${editing.shop.name.toLowerCase()}@loqual.be`}
              value={editing.form.from_email}
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, from_email: e.target.value } })} />

            <label className="flbl" style={{ marginTop: 10 }}>Reply-to (laat leeg om afzender te gebruiken)</label>
            <input className="input fw" type="email"
              value={editing.form.reply_to}
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, reply_to: e.target.value } })} />

            <label className="flbl" style={{ marginTop: 10 }}>SMTP-gebruiker</label>
            <input className="input fw" placeholder="meestal hetzelfde als het afzenderadres"
              value={editing.form.smtp_user}
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, smtp_user: e.target.value } })} />

            <label className="flbl" style={{ marginTop: 10 }}>App-wachtwoord</label>
            <input className="input fw" type="password" autoComplete="new-password"
              value={editing.form.smtp_password}
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, smtp_password: e.target.value } })} />

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="flbl">SMTP-host</label>
                <input className="input fw" value={editing.form.smtp_host}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, smtp_host: e.target.value } })} />
              </div>
              <div style={{ width: 110 }}>
                <label className="flbl">Poort</label>
                <input className="input fw" type="number" value={editing.form.smtp_port}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, smtp_port: e.target.value } })} />
              </div>
            </div>

            <div className="row-item" style={{ marginTop: 12 }}>
              <span>Verzending actief</span>
              <button
                className={'sw' + (editing.form.active ? ' on' : '')}
                onClick={() => setEditing({ ...editing, form: { ...editing.form, active: !editing.form.active } })}
                aria-label="Actief"
              >
                <span className="knob" />
              </button>
            </div>

            <div className="hint" style={{ marginBottom: 0, marginTop: 8 }}>
              Het app-wachtwoord wordt opgeslagen in de databank, enkel zichtbaar voor admins.
            </div>

            {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`} style={{ marginTop: 10 }}>{msg.text}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setEditing(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Bezig…' : 'Bewaren'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ovl = {
  position: 'fixed', inset: 0, background: 'rgba(42, 37, 33, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50,
}
const dlg = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
  padding: 22, maxWidth: 460, width: '100%', boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
  maxHeight: '90vh', overflowY: 'auto',
}
