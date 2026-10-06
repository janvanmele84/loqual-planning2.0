import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MONTH_LONG  = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

function keyFor(shopId, monthIso) { return `${shopId}:${monthIso}` }
function labelShort(iso) { const d = new Date(iso); return `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` }
function labelLong(iso) { const d = new Date(iso); return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}` }

export default function AdminReleasePanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState(null) // {shopId, shopName, month}

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_release_overview')
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Overzicht laden mislukt.' })
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // Groepeer per shop
  const shopMap = new Map()
  const monthSet = new Set()
  rows.forEach((r) => {
    monthSet.add(r.month_start)
    if (!shopMap.has(r.shop_id)) shopMap.set(r.shop_id, { shop_id: r.shop_id, shop_name: r.shop_name, cells: new Map() })
    shopMap.get(r.shop_id).cells.set(r.month_start, r)
  })
  const months = Array.from(monthSet).sort()
  const shops = Array.from(shopMap.values()).sort((a, b) => a.shop_name.localeCompare(b.shop_name))

  async function doRelease() {
    const c = confirm
    setConfirm(null)
    if (!c) return
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.rpc('admin_release_shop_month', {
        p_shop_id: c.shopId,
        p_month: c.month,
      })
      if (error) throw error
      if (data?.ok === false) {
        setMsg({ kind: 'err', text: 'Deze maand was al vrijgegeven.' })
      } else {
        const parts = [`${c.shopName} vrijgegeven voor ${labelLong(c.month)}`]
        if (data?.shift_count === 0) parts.push('(⚠️ geen shifts aanwezig — maak ze eerst aan via Winkel-tab)')
        else parts.push(`(${data.shift_count} shifts)`)
        setMsg({ kind: 'good', text: parts.join(' ') })
      }
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Vrijgeven mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  function cellStyle(status) {
    const base = { padding: '4px 6px', textAlign: 'center', fontSize: 12, borderRight: '1px solid var(--line)' }
    if (status === 'released') return { ...base, background: '#e8f4e8', color: '#2f5a31' }
    if (status === 'noshifts') return { ...base, background: '#fff3cd', color: '#8a571f', cursor: 'pointer' }
    return { ...base, background: 'transparent', cursor: 'pointer' }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title">Admin — vrijgeven per winkel per maand</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Overzicht van de huidige + 6 volgende maanden. Klik op een lege cel om die maand vrij te geven
        voor die winkel. Betrokken ondernemers krijgen onmiddellijk de vrijgave-mail.
      </div>

      {loading ? (
        <div className="muted">Laden…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', position: 'sticky', left: 0, background: 'var(--surface)' }}>Winkel</th>
                {months.map((m) => (
                  <th key={m} style={{ padding: '6px 8px', textAlign: 'center', textTransform: 'capitalize', fontWeight: 500, color: 'var(--muted)' }}>
                    {labelShort(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => (
                <tr key={s.shop_id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--surface)' }}>
                    {s.shop_name}
                  </td>
                  {months.map((m) => {
                    const cell = s.cells.get(m)
                    const released = !!cell?.released_at
                    const hasShifts = (cell?.shift_count || 0) > 0
                    const status = released ? 'released' : (hasShifts ? 'empty' : 'noshifts')
                    return (
                      <td
                        key={m}
                        style={cellStyle(status)}
                        onClick={() => !released && !busy && setConfirm({ shopId: s.shop_id, shopName: s.shop_name, month: m })}
                        title={
                          released
                            ? `Vrijgegeven op ${new Date(cell.released_at).toLocaleDateString('nl-BE')}`
                            : (hasShifts ? `${cell.shift_count} shifts — klik om vrij te geven` : 'Geen shifts — klik om toch te proberen vrij te geven')
                        }
                      >
                        {released ? '✓' : (hasShifts ? cell.shift_count : '—')}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#e8f4e8', border: '1px solid #b8dbb8', verticalAlign: 'middle', marginRight: 4 }} /> vrijgegeven</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'transparent', border: '1px solid var(--line)', verticalAlign: 'middle', marginRight: 4 }} /> klaar om vrij te geven (getal = aantal shifts)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#fff3cd', border: '1px solid #f0c040', verticalAlign: 'middle', marginRight: 4 }} /> geen shifts aangemaakt</span>
      </div>

      {msg && (
        <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </div>
      )}

      {confirm && (
        <div style={ovl} onClick={() => setConfirm(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>Vrijgeven bevestigen</h3>
            <p style={{ fontSize: 14, marginBottom: 10 }}>
              Je gaat <strong>{confirm.shopName}</strong> vrijgeven voor <strong style={{ textTransform: 'capitalize' }}>{labelLong(confirm.month)}</strong>.
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Alle betrokken ondernemers krijgen onmiddellijk de vrijgave-mail en kunnen hun beschikbaarheden ingeven.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirm(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={doRelease}>Ja, vrijgeven</button>
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
