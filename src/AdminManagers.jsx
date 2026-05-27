import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

export default function AdminManagers() {
  const [shops, setShops] = useState([])
  const [managers, setManagers] = useState([]) // {id, first_name, last_name}
  const [links, setLinks] = useState([]) // {id, manager_id, shop_id}
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {kind:'new'}
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const { data: sh } = await supabase.from('shops').select('id, name, active').order('name')
    const { data: mg } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .eq('role', 'shopmanager')
      .order('first_name')
    const { data: lk } = await supabase.from('shopmanager_shops').select('id, manager_id, shop_id')
    setShops(sh || [])
    setManagers(mg || [])
    setLinks(lk || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const mgrName = (id) => {
    const m = managers.find((x) => x.id === id)
    return m ? [m.first_name, m.last_name].filter(Boolean).join(' ') : 'Onbekend'
  }

  async function assign(shopId, managerId) {
    if (!managerId) return
    setBusy(true)
    try {
      const { error } = await supabase.from('shopmanager_shops').insert({ shop_id: shopId, manager_id: managerId })
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Toewijzen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function unassign(linkId) {
    setBusy(true)
    try {
      const { error } = await supabase.from('shopmanager_shops').delete().eq('id', linkId)
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Verwijderen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function createManager() {
    if (!form.first_name.trim() || !form.email.trim()) {
      setMsg({ kind: 'err', text: 'Voornaam en e-mail zijn verplicht.' })
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('employees').insert({
        role: 'shopmanager',
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        email: form.email.trim(),
      })
      if (error) throw error
      setDialog(null)
      await load()
      setMsg({ kind: 'good', text: 'Manager toegevoegd. Maak nog een login met dit e-mailadres aan.' })
    } catch (e) {
      const dup = (e?.message || '').toLowerCase().includes('duplicate')
      setMsg({ kind: 'err', text: dup ? 'Dit e-mailadres bestaat al.' : 'Toevoegen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-title">Managers per winkel</div>
        <div className="hint" style={{ marginTop: 0 }}>
          Wijs shopmanagers toe aan winkels. Eén winkel kan meerdere managers hebben, en één manager meerdere winkels.
        </div>
        {loading ? (
          <div className="muted">Laden…</div>
        ) : shops.length === 0 ? (
          <div className="muted">Maak eerst een winkel aan.</div>
        ) : (
          shops.map((s) => {
            const assigned = links.filter((l) => l.shop_id === s.id)
            const assignedIds = new Set(assigned.map((l) => l.manager_id))
            const available = managers.filter((m) => !assignedIds.has(m.id))
            return (
              <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {s.name}
                  {!s.active && <span className="tag niet" style={{ marginLeft: 8 }}>Niet actief</span>}
                </div>
                {assigned.length === 0 ? (
                  <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>Nog geen manager.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {assigned.map((l) => (
                      <span key={l.id} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {mgrName(l.manager_id)}
                        <button
                          onClick={() => unassign(l.id)}
                          disabled={busy}
                          style={{ all: 'unset', cursor: 'pointer', color: 'var(--danger)', fontWeight: 700 }}
                          aria-label="Verwijderen"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <select
                  className="input"
                  value=""
                  onChange={(e) => assign(s.id, e.target.value)}
                  disabled={busy || available.length === 0}
                  style={{ width: '100%' }}
                >
                  <option value="">{available.length ? '+ Manager toewijzen…' : 'Geen managers meer beschikbaar'}</option>
                  {available.map((m) => (
                    <option key={m.id} value={m.id}>{[m.first_name, m.last_name].filter(Boolean).join(' ')}</option>
                  ))}
                </select>
              </div>
            )
          })
        )}
        <button
          className="btn btn-block"
          style={{ marginTop: 12 }}
          onClick={() => { setForm({ first_name: '', last_name: '', email: '' }); setDialog({ kind: 'new' }); setMsg(null) }}
          disabled={busy}
        >
          + Nieuwe manager
        </button>
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

      {dialog && (
        <div style={ovl} onClick={() => setDialog(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 14 }}>Nieuwe manager</h3>
            <label className="flbl">Voornaam</label>
            <input className="input fw" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <label className="flbl" style={{ marginTop: 10 }}>Achternaam</label>
            <input className="input fw" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <label className="flbl" style={{ marginTop: 10 }}>E-mail</label>
            <input className="input fw" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="hint" style={{ marginBottom: 0 }}>
              Dit maakt de persoon aan. De login (met wachtwoord) maak je nog apart aan in Authentication met hetzelfde e-mailadres.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setDialog(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={createManager} disabled={busy}>{busy ? 'Bezig…' : 'Toevoegen'}</button>
            </div>
          </div>
        </div>
      )}
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
}
