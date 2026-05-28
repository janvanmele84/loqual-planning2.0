import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog.jsx'

export default function AdminManagers() {
  const [shops, setShops] = useState([])
  const [managers, setManagers] = useState([]) // role=shopmanager
  const [otherEmps, setOtherEmps] = useState([]) // role ≠ shopmanager, ≠ admin
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {kind:'add'}
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState(null) // null | employee

  const load = useCallback(async () => {
    setLoading(true)
    const { data: sh } = await supabase.from('shops').select('id, name, active').order('name')
    const { data: emp } = await supabase
      .from('employees')
      .select('id, first_name, last_name, email, role, active')
      .eq('active', true)
      .order('first_name')
    setShops(sh || [])
    setManagers((emp || []).filter((e) => e.role === 'shopmanager'))
    setOtherEmps((emp || []).filter((e) => e.role !== 'shopmanager' && e.role !== 'admin'))
    const { data: lk } = await supabase.from('shopmanager_shops').select('id, manager_id, shop_id')
    setLinks(lk || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

  async function promote(emp) {
    setBusy(true)
    try {
      const { error } = await supabase.from('employees').update({ role: 'shopmanager' }).eq('id', emp.id)
      if (error) throw error
      setConfirm(null); setDialog(null); setQuery('')
      await load()
      setMsg({ kind: 'good', text: `${emp.first_name} is nu shopmanager. Je kunt hem nu aan een winkel toewijzen.` })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Aanduiden mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return otherEmps.slice(0, 30)
    return otherEmps.filter((e) => {
      const s = [e.first_name, e.last_name, e.email].filter(Boolean).join(' ').toLowerCase()
      return s.includes(q)
    }).slice(0, 30)
  }, [otherEmps, query])

  const roleLabel = (r) => ({
    ondernemer: 'ondernemer', flexi: 'flexi', jobstudent: 'jobstudent', boekhouding: 'boekhouding',
  })[r] || r

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
          onClick={() => { setQuery(''); setDialog({ kind: 'add' }); setMsg(null) }}
          disabled={busy}
        >
          + Manager aanduiden
        </button>
      </div>

      {msg && !dialog && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

      {dialog && (
        <div style={ovl} onClick={() => setDialog(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>Manager aanduiden</h3>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
              Kies een bestaande medewerker. Hun rol wordt naar shopmanager gezet. Maak nieuwe mensen eerst aan via
              de tab Accounts.
            </p>
            <input
              className="input fw"
              type="text"
              placeholder="Zoek op naam of e-mail…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--line)' }}>
              {filtered.length === 0 ? (
                <div className="muted" style={{ padding: '12px 0', fontSize: 13 }}>
                  {otherEmps.length === 0 ? 'Geen kandidaat-medewerkers gevonden.' : 'Geen resultaten.'}
                </div>
              ) : (
                filtered.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setConfirm(e)}
                    style={{
                      all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
                      padding: '10px 4px', borderBottom: '1px solid var(--line)', fontSize: 14,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {e.first_name}{e.last_name ? ' ' + e.last_name : ''}
                      <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 6 }}>· {roleLabel(e.role)}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{e.email}</div>
                  </button>
                ))
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn" onClick={() => setDialog(null)}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title="Rol wijzigen?"
        message={confirm
          ? `${confirm.first_name}${confirm.last_name ? ' ' + confirm.last_name : ''} is momenteel ${roleLabel(confirm.role)}. Doorgaan en de rol naar shopmanager wijzigen?`
          : ''}
        confirmLabel="Ja, maak shopmanager"
        onConfirm={() => confirm && promote(confirm)}
        onCancel={() => setConfirm(null)}
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
  padding: 22, maxWidth: 420, width: '100%', boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
  maxHeight: '90vh', overflowY: 'auto',
}
