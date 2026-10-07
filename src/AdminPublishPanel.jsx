import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MONTH_LONG  = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

function labelShort(iso) { const d = new Date(iso); return `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` }
function labelLong(iso) { const d = new Date(iso); return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}` }

export default function AdminPublishPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState(null) // {shopId, shopName, month, assignmentCount}

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

  const shopMap = new Map()
  const monthSet = new Set()
  rows.forEach((r) => {
    monthSet.add(r.month_start)
    if (!shopMap.has(r.shop_id)) shopMap.set(r.shop_id, { shop_id: r.shop_id, shop_name: r.shop_name, cells: new Map() })
    shopMap.get(r.shop_id).cells.set(r.month_start, r)
  })
  const months = Array.from(monthSet).sort()
  const shops = Array.from(shopMap.values()).sort((a, b) => a.shop_name.localeCompare(b.shop_name))

  async function doPublish() {
    const c = confirm
    setConfirm(null)
    if (!c) return
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.rpc('admin_publish_shop_month', {
        p_shop_id: c.shopId,
        p_month: c.month,
      })
      if (error) throw error
      setMsg({
        kind: 'good',
        text: `${c.shopName} gepubliceerd voor ${labelLong(c.month)} — ${data.mails_queued} nieuwe mails in wachtrij (${data.employees_in_plan} medewerkers in plan).`,
      })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Publiceren mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  function cellStyle(status) {
    const base = { padding: '4px 6px', textAlign: 'center', fontSize: 12, borderRight: '1px solid var(--line)' }
    if (status === 'published') return { ...base, background: '#e8f4e8', color: '#2f5a31' }
    if (status === 'ready')     return { ...base, background: 'transparent', cursor: 'pointer' }
    if (status === 'noplan')    return { ...base, background: '#f5f5f5', color: '#bbb' }
    return { ...base, background: '#fff3cd', color: '#8a571f' }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title">Admin — publiceren per winkel per maand</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Overzicht van de huidige + 6 volgende maanden. Klik op een cel om die winkel+maand te publiceren.
        Alle ingeplande medewerkers krijgen onmiddellijk de publicatie-mail (met ICS-bijlage) als ze die
        voor deze maand nog niet hadden.
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
                    const published = !!cell?.published_at
                    const hasAssignments = (cell?.assignment_count || 0) > 0
                    const status = published ? 'published' : (hasAssignments ? 'ready' : 'noplan')
                    const clickable = !published && hasAssignments && !busy
                    return (
                      <td
                        key={m}
                        style={cellStyle(status)}
                        onClick={() => clickable && setConfirm({
                          shopId: s.shop_id, shopName: s.shop_name, month: m, assignmentCount: cell.assignment_count,
                        })}
                        title={
                          published
                            ? `Gepubliceerd op ${new Date(cell.published_at).toLocaleDateString('nl-BE')}`
                            : (hasAssignments ? `${cell.assignment_count} toewijzingen — klik om te publiceren` : 'Geen planning aanwezig')
                        }
                      >
                        {published ? '✓' : (hasAssignments ? cell.assignment_count : '—')}
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
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#e8f4e8', border: '1px solid #b8dbb8', verticalAlign: 'middle', marginRight: 4 }} /> gepubliceerd</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'transparent', border: '1px solid var(--line)', verticalAlign: 'middle', marginRight: 4 }} /> klaar om te publiceren (getal = aantal toewijzingen)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#f5f5f5', border: '1px solid #e5e5e5', verticalAlign: 'middle', marginRight: 4 }} /> geen planning aanwezig</span>
      </div>

      {msg && (
        <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </div>
      )}

      {confirm && (
        <div style={ovl} onClick={() => setConfirm(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>Publiceren bevestigen</h3>
            <p style={{ fontSize: 14, marginBottom: 10 }}>
              Je gaat <strong>{confirm.shopName}</strong> publiceren voor <strong style={{ textTransform: 'capitalize' }}>{labelLong(confirm.month)}</strong>.
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Er zijn {confirm.assignmentCount} toewijzingen in deze winkel voor deze maand. Alle betrokken
              medewerkers krijgen een mail met hun planning (en ICS-bijlage voor hun agenda), tenzij ze die
              al eerder kregen voor deze maand.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirm(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={doPublish}>Ja, publiceren</button>
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
