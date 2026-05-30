import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog.jsx'

const ROLES = ['admin', 'shopmanager', 'boekhouding', 'ondernemer', 'flexi', 'jobstudent']
const ROLE_LABEL = {
  admin: 'Admin',
  shopmanager: 'Shopmanager',
  boekhouding: 'Boekhouding',
  ondernemer: 'Ondernemer',
  flexi: 'Flexi',
  jobstudent: 'Jobstudent',
}

export default function AdminAccounts({ employee }) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [filter, setFilter] = useState('all')
  const [dialog, setDialog] = useState(null) // null | {kind:'new'} | {kind:'edit', id} | {kind:'del', emp}
  const [form, setForm] = useState({ role: 'flexi', first_name: '', last_name: '', email: '', company_name: '', active: true })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('employees')
      .select('id, auth_user_id, role, first_name, last_name, email, company_name, active')
      .order('role')
      .order('first_name')
    setPeople(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shown = people.filter((p) => filter === 'all' || p.role === filter)

  function openNew() {
    setForm({ role: 'flexi', first_name: '', last_name: '', email: '', company_name: '', active: true })
    setDialog({ kind: 'new' })
    setMsg(null)
  }
  function openEdit(p) {
    setForm({
      role: p.role,
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      email: p.email || '',
      company_name: p.company_name || '',
      active: p.active,
    })
    setDialog({ kind: 'edit', id: p.id })
    setMsg(null)
  }

  async function save() {
    if (!form.first_name.trim() || !form.email.trim()) {
      setMsg({ kind: 'err', text: 'Voornaam en e-mail zijn verplicht.' })
      return
    }
    const payload = {
      role: form.role,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim(),
      company_name: form.role === 'ondernemer' ? form.company_name.trim() || null : null,
      active: form.active,
    }
    setBusy(true)
    try {
      if (dialog.kind === 'new') {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').update(payload).eq('id', dialog.id)
        if (error) throw error
      }
      setDialog(null)
      await load()
      setMsg({ kind: 'good', text: dialog.kind === 'new' ? 'Account toegevoegd. Maak nog een login aan met dit e-mailadres.' : 'Bewaard.' })
    } catch (e) {
      const dup = (e?.message || '').toLowerCase().includes('duplicate')
      setMsg({ kind: 'err', text: dup ? 'Dit e-mailadres bestaat al.' : 'Bewaren mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(p) {
    setBusy(true)
    try {
      const { error } = await supabase.from('employees').update({ active: !p.active }).eq('id', p.id)
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Wijzigen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    const p = dialog.emp
    setDialog(null)
    setBusy(true)
    try {
      const { error } = await supabase.from('employees').delete().eq('id', p.id)
      if (error) throw error
      await load()
      setMsg({ kind: 'good', text: `${p.first_name} verwijderd.` })
    } catch (e) {
      setMsg({
        kind: 'err',
        text: 'Verwijderen lukt niet — deze persoon heeft gegevens aangemaakt (bv. planning). Zet hem liever op niet-actief.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function bulkCreate(ids) {
    if (!ids.length) return
    const pwd = window.prompt(
      `Welk tijdelijk wachtwoord wil je instellen voor deze ${ids.length} medewerker(s)?\n\nIedereen krijgt hetzelfde wachtwoord en wordt bij eerste login gevraagd om er zelf een te kiezen.`,
      'Loqual2026',
    )
    if (pwd === null) return
    if (pwd.length < 6) { setMsg({ kind: 'err', text: 'Wachtwoord moet minstens 6 tekens lang zijn.' }); return }
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('bulk-create-logins', {
        body: { employee_ids: ids, password: pwd },
      })
      if (error) throw error
      const r = data || {}
      const bits = []
      if (r.created) bits.push(`${r.created} aangemaakt`)
      if (r.linked) bits.push(`${r.linked} bestaande gekoppeld`)
      if (r.failed) bits.push(`${r.failed} mislukt`)
      setMsg({
        kind: r.failed ? 'err' : 'good',
        text: `${bits.join(', ') || 'Geen wijzigingen'}. Tijdelijk wachtwoord: "${r.password || pwd}".${r.errors?.length ? ' Fout: ' + r.errors.slice(0, 3).join('; ') : ''}`,
      })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Aanmaken mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function invite(ids, label) {
    if (!ids.length) return
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('invite-users', {
        body: {
          employee_ids: ids,
          redirect_to: window.location.origin + window.location.pathname,
        },
      })
      if (error) throw error
      const r = data || {}
      const bits = []
      if (r.invited) bits.push(`${r.invited} uitgenodigd`)
      if (r.reLinked) bits.push(`${r.reLinked} hergekoppeld (paswoord-reset verstuurd)`)
      if (r.skipped) bits.push(`${r.skipped} overgeslagen`)
      if (r.failed) bits.push(`${r.failed} mislukt`)
      const text = bits.length ? bits.join(', ') : 'Geen wijzigingen.'
      setMsg({
        kind: r.failed ? 'err' : 'good',
        text: `${label}: ${text}.${r.errors?.length ? ' Fout: ' + r.errors.slice(0, 3).join('; ') : ''}`,
      })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Versturen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pills" style={{ marginBottom: 12 }}>
        <button className={'pill' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>Alle</button>
        {ROLES.map((r) => (
          <button key={r} className={'pill' + (filter === r ? ' active' : '')} onClick={() => setFilter(r)}>
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      {(() => {
        const noLoginPool = people.filter((p) => p.active && !p.auth_user_id && p.email)
        const noLogin = noLoginPool.length
        if (noLogin === 0) return null
        return (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>{noLogin}</strong> actieve medewerker(s) hebben nog geen login.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: 13 }}
                disabled={busy}
                onClick={() => bulkCreate(noLoginPool.map((p) => p.id))}
              >
                Logins aanmaken (zonder mail)
              </button>
              <button
                className="btn"
                style={{ padding: '6px 12px', fontSize: 13 }}
                disabled={busy}
                onClick={() => invite(noLoginPool.map((p) => p.id), `Bulkuitnodiging (${noLogin})`)}
              >
                Mail-uitnodigingen versturen
              </button>
            </div>
            <div className="hint" style={{ marginBottom: 0, marginTop: 8 }}>
              "Zonder mail" geeft iedereen tijdelijk hetzelfde wachtwoord; bij eerste login moet de gebruiker
              er zelf een kiezen. "Via mail" stuurt elke medewerker een persoonlijke uitnodigingslink (vereist
              dat de auth-SMTP in Supabase ingesteld is).
            </div>
          </div>
        )
      })()}

      <div className="card">
        {loading ? (
          <div className="muted">Laden…</div>
        ) : shown.length === 0 ? (
          <div className="muted">Geen accounts in deze categorie.</div>
        ) : (
          shown.map((p) => {
            const isSelf = p.id === employee.id
            return (
              <div className="row-item" key={p.id}>
                <span style={{ minWidth: 0 }}>
                  {[p.first_name, p.last_name].filter(Boolean).join(' ')}
                  <span className="muted"> · {ROLE_LABEL[p.role] || p.role}</span>
                  {p.company_name && <span className="muted"> · {p.company_name}</span>}
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                    {p.email}
                    {!p.auth_user_id && <span className="tag niet" style={{ marginLeft: 8 }}>geen login</span>}
                    {!p.active && <span className="tag niet" style={{ marginLeft: 8 }}>niet actief</span>}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {!p.auth_user_id && p.active && p.email && (
                    <button
                      className="btn"
                      style={{ padding: '6px 10px', fontSize: 13 }}
                      onClick={() => bulkCreate([p.id])}
                      disabled={busy}
                    >
                      Login aanmaken
                    </button>
                  )}
                  <button className="btn" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => openEdit(p)} disabled={busy}>
                    Bewerken
                  </button>
                  <button
                    className={'sw' + (p.active ? ' on' : '')}
                    onClick={() => toggleActive(p)}
                    disabled={busy || isSelf}
                    aria-label="Actief"
                  >
                    <span className="knob" />
                  </button>
                  {!isSelf && (
                    <button
                      className="btn"
                      style={{ padding: '6px 10px', fontSize: 13, color: 'var(--danger)' }}
                      onClick={() => setDialog({ kind: 'del', emp: p })}
                      disabled={busy}
                    >
                      Verwijderen
                    </button>
                  )}
                </span>
              </div>
            )
          })
        )}
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={openNew} disabled={busy}>
          + Account toevoegen
        </button>
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

      {(dialog?.kind === 'new' || dialog?.kind === 'edit') && (
        <div style={ovl} onClick={() => setDialog(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 14 }}>{dialog.kind === 'new' ? 'Nieuw account' : 'Account bewerken'}</h3>
            <label className="flbl">Rol</label>
            <select className="input fw" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <label className="flbl" style={{ marginTop: 10 }}>Voornaam</label>
            <input className="input fw" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <label className="flbl" style={{ marginTop: 10 }}>Achternaam</label>
            <input className="input fw" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <label className="flbl" style={{ marginTop: 10 }}>E-mail</label>
            <input className="input fw" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {form.role === 'ondernemer' && (
              <>
                <label className="flbl" style={{ marginTop: 10 }}>Bedrijfsnaam</label>
                <input className="input fw" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </>
            )}
            <div className="row-item" style={{ marginTop: 12 }}>
              <span>Actief</span>
              <button className={'sw' + (form.active ? ' on' : '')} onClick={() => setForm({ ...form, active: !form.active })} aria-label="Actief">
                <span className="knob" />
              </button>
            </div>
            {dialog.kind === 'new' && (
              <div className="hint" style={{ marginBottom: 0 }}>
                Dit maakt de persoon aan. De login (met wachtwoord) maak je nog apart aan in Authentication met hetzelfde e-mailadres.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setDialog(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Bezig…' : 'Bewaren'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog?.kind === 'del'}
        title="Account verwijderen?"
        message={
          dialog?.kind === 'del'
            ? `Weet je zeker dat je ${dialog.emp.first_name} wil verwijderen? Dit wist ook al hun beschikbaarheden en planning-historiek, en kan niet ongedaan worden. Voor iemand die al gewerkt heeft, kies je beter "niet-actief".`
            : ''
        }
        confirmLabel="Ja, verwijderen"
        onConfirm={doDelete}
        onCancel={() => setDialog(null)}
      />
    </>
  )
}

const ovl = {
  position: 'fixed', inset: 0, background: 'rgba(42, 37, 33, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50,
}
const dlg = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
  padding: 22, maxWidth: 380, width: '100%', boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
  maxHeight: '90vh', overflowY: 'auto',
}
