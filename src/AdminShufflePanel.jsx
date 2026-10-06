import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function monthLabel(iso) {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default function AdminShufflePanel() {
  const today = new Date()
  // Kies 3 maanden terug tot 6 maanden vooruit
  const months = []
  for (let i = -3; i <= 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    months.push(ymd(d))
  }
  const defaultMonth = ymd(new Date(today.getFullYear(), today.getMonth() + 1, 1))

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const [shops, setShops] = useState([])
  const [selectedShopIds, setSelectedShopIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('shops')
        .select('id, name')
        .eq('active', true)
        .order('name')
      setShops(data || [])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  function toggle(id) {
    const next = new Set(selectedShopIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedShopIds(next)
  }
  function selectAll() { setSelectedShopIds(new Set(shops.map((s) => s.id))) }
  function selectNone() { setSelectedShopIds(new Set()) }

  async function doShuffle() {
    setConfirmOpen(false)
    setBusy(true); setMsg(null)
    try {
      const shopIds = Array.from(selectedShopIds)
      const { data, error } = await supabase.rpc('admin_shuffle_shops', {
        p_month: selectedMonth,
        p_shop_ids: shopIds.length === 0 ? null : shopIds,
      })
      if (error) throw error
      if (data?.ok === false) {
        setMsg({ kind: 'err', text: data.reason || 'Shuffle mislukt.' })
      } else {
        setMsg({
          kind: 'good',
          text: `Shuffle uitgevoerd voor ${data.shops_requested} winkel(s). ${data.assignments_deleted} oude toewijzingen gewist. Manuele toewijzingen bleven staan.`,
        })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Shuffle mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  const count = selectedShopIds.size

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title">Handmatige shuffle</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Kies een maand en één of meerdere winkels, en start de shuffle opnieuw.
        Manuele toewijzingen van shopmanagers blijven staan, al de rest wordt
        opnieuw berekend op basis van de huidige beschikbaarheden.
      </div>

      <label className="flbl">Maand</label>
      <select
        className="input fw"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        style={{ marginBottom: 14, textTransform: 'capitalize' }}
      >
        {months.map((m) => (
          <option key={m} value={m}>{monthLabel(m)}</option>
        ))}
      </select>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label className="flbl" style={{ margin: 0 }}>Winkels</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={selectAll} disabled={busy}>Alle</button>
          <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={selectNone} disabled={busy}>Geen</button>
        </div>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8, marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>
        {shops.map((s) => (
          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedShopIds.has(s.id)}
              onChange={() => toggle(s.id)}
              disabled={busy}
            />
            <span style={{ fontSize: 14 }}>{s.name}</span>
          </label>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        {count === 0
          ? 'Geen winkels aangevinkt — klik op "Alle" om alle vrijgegeven winkels te shufflen.'
          : `${count} winkel${count === 1 ? '' : 's'} geselecteerd.`}
      </div>

      <button
        className="btn btn-primary"
        disabled={busy || count === 0}
        onClick={() => setConfirmOpen(true)}
      >
        {busy ? 'Bezig…' : 'Shuffle starten'}
      </button>

      {msg && (
        <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </div>
      )}

      {confirmOpen && (
        <div style={ovl} onClick={() => setConfirmOpen(false)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>Shuffle bevestigen</h3>
            <p style={{ fontSize: 14, marginBottom: 14 }}>
              Je gaat <strong>{count}</strong> winkel{count === 1 ? '' : 's'} opnieuw shufflen voor{' '}
              <strong style={{ textTransform: 'capitalize' }}>{monthLabel(selectedMonth)}</strong>.
            </p>
            <p style={{ fontSize: 13, marginBottom: 14, color: 'var(--muted)' }}>
              Alle automatisch toegewezen dagen in die winkels worden gewist en opnieuw berekend.
              Dagen die manueel vastgezet zijn blijven staan.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmOpen(false)}>Annuleren</button>
              <button className="btn btn-primary" onClick={doShuffle}>Ja, shuffelen</button>
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
  padding: 22, maxWidth: 420, width: '100%',
}
