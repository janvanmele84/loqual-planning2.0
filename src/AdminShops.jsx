import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

export default function AdminShops() {
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {kind:'new'} | {kind:'edit', id}
  const [form, setForm] = useState({ name: '', address: '', active: true })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('shops').select('id, name, address, active').order('name')
    setShops(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openNew() {
    setForm({ name: '', address: '', active: true })
    setDialog({ kind: 'new' })
    setMsg(null)
  }
  function openEdit(s) {
    setForm({ name: s.name, address: s.address || '', active: s.active })
    setDialog({ kind: 'edit', id: s.id })
    setMsg(null)
  }

  async function save() {
    if (!form.name.trim()) {
      setMsg({ kind: 'err', text: 'Geef een naam in.' })
      return
    }
    setBusy(true)
    try {
      if (dialog.kind === 'new') {
        const { error } = await supabase
          .from('shops')
          .insert({ name: form.name.trim(), address: form.address.trim() || null, active: form.active })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('shops')
          .update({ name: form.name.trim(), address: form.address.trim() || null, active: form.active })
          .eq('id', dialog.id)
        if (error) throw error
      }
      setDialog(null)
      await load()
      setMsg({ kind: 'good', text: 'Bewaard.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bewaren mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(s) {
    setBusy(true)
    try {
      const { error } = await supabase.from('shops').update({ active: !s.active }).eq('id', s.id)
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Wijzigen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-title">Winkels</div>
        {loading ? (
          <div className="muted">Laden…</div>
        ) : shops.length === 0 ? (
          <div className="muted">Nog geen winkels.</div>
        ) : (
          shops.map((s) => (
            <div className="row-item" key={s.id}>
              <span>
                {s.name}
                {!s.active && <span className="tag niet" style={{ marginLeft: 8 }}>Niet actief</span>}
                {s.address && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{s.address}</span>}
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn" style={{ padding: '7px 12px', fontSize: 14 }} onClick={() => openEdit(s)} disabled={busy}>
                  Bewerken
                </button>
                <button
                  className={'sw' + (s.active ? ' on' : '')}
                  onClick={() => toggleActive(s)}
                  disabled={busy}
                  aria-label="Actief"
                >
                  <span className="knob" />
                </button>
              </span>
            </div>
          ))
        )}
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={openNew} disabled={busy}>
          + Winkel toevoegen
        </button>
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

      {dialog && (
        <div style={ovl} onClick={() => setDialog(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 14 }}>{dialog.kind === 'new' ? 'Nieuwe winkel' : 'Winkel bewerken'}</h3>
            <label className="flbl">Naam</label>
            <input className="input fw" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label className="flbl" style={{ marginTop: 10 }}>Adres (optioneel)</label>
            <input className="input fw" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="row-item" style={{ marginTop: 12 }}>
              <span>Actief</span>
              <button className={'sw' + (form.active ? ' on' : '')} onClick={() => setForm({ ...form, active: !form.active })} aria-label="Actief">
                <span className="knob" />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setDialog(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Bezig…' : 'Bewaren'}</button>
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
