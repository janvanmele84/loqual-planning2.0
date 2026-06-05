import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

function monthShort(iso) {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
}
function dateShort(iso) {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export default function AdminReleases() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('shop_release_status')
      .select('*')
      .order('shop_name')
      .order('month_start')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function manualRelease(shop_id, month_start) {
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.rpc('release_availability', { p_shop: shop_id, p_month: month_start })
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Vrijgeven mislukt.' })
    } finally { setBusy(false) }
  }

  async function runAutoRelease() {
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.rpc('auto_release_overdue')
      if (error) throw error
      await load()
      setMsg({ kind: 'good', text: `Auto-release uitgevoerd. ${data ?? 0} maand(en) automatisch vrijgegeven.` })
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Auto-release mislukt.' })
    } finally { setBusy(false) }
  }

  // Bouw matrix [shop][monthKey] = row
  const shopMap = {}
  const monthSet = new Set()
  rows.forEach((r) => {
    if (!shopMap[r.shop_id]) shopMap[r.shop_id] = { name: r.shop_name, months: {} }
    shopMap[r.shop_id].months[r.month_start] = r
    monthSet.add(r.month_start)
  })
  const months = Array.from(monthSet).sort()
  const shops = Object.entries(shopMap).map(([id, v]) => ({ id, ...v }))

  if (loading) return <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="section-title">Vrijgaves per winkel</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Deadline = 15de van de voor-voorgaande maand. Niet-vrijgegeven maanden worden 's nachts automatisch vrijgegeven na het overschrijden van de deadline.
        </div>
        <button className="btn" disabled={busy} onClick={runAutoRelease}>Auto-release nu uitvoeren</button>
        {msg && <div className={'msg ' + (msg.kind === 'err' ? 'err' : 'good')} style={{ marginTop: 10 }}>{msg.text}</div>}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Winkel</th>
              {months.map((m) => (
                <th key={m} style={th}>{monthShort(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shops.map((s) => (
              <tr key={s.id}>
                <td style={tdName}>{s.name}</td>
                {months.map((m) => {
                  const r = s.months[m]
                  if (!r) return <td key={m} style={td}>—</td>
                  if (r.status === 'released') {
                    return <td key={m} style={{ ...td, ...cell.green }} title={`Vrijgegeven op ${r.released_at?.slice(0, 10) || ''}`}>✓</td>
                  }
                  if (r.status === 'auto') {
                    return <td key={m} style={{ ...td, ...cell.orange }} title={`Automatisch vrijgegeven (deadline ${dateShort(r.release_deadline)})`}>auto</td>
                  }
                  if (r.status === 'overdue') {
                    return (
                      <td key={m} style={{ ...td, ...cell.red }} title={`Achterstand sinds ${dateShort(r.release_deadline)}`}>
                        <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} disabled={busy} onClick={() => manualRelease(s.id, m)}>geef vrij</button>
                      </td>
                    )
                  }
                  return (
                    <td key={m} style={{ ...td, ...cell.blue }} title={`Te doen tegen ${dateShort(r.release_deadline)} (${r.days_until_release} dagen)`}>
                      {r.days_until_release}d
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 12, color: '#6b6b6b' }}>
          <span style={{ ...legend, ...cell.green }}>✓</span> vrijgegeven   
          <span style={{ ...legend, ...cell.blue, marginLeft: 12 }}>Xd</span> nog X dagen tot deadline   
          <span style={{ ...legend, ...cell.red, marginLeft: 12 }}>geef vrij</span> achterstand   
          <span style={{ ...legend, ...cell.orange, marginLeft: 12 }}>auto</span> automatisch vrijgegeven
        </div>
      </div>
    </>
  )
}

const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e7e2db', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f0ece6', whiteSpace: 'nowrap' }
const tdName = { ...td, textAlign: 'left', fontWeight: 500 }
const legend = { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11 }
const cell = {
  green:  { background: '#e8efe4', color: '#2f5a31' },
  blue:   { background: '#e6eef5', color: '#1f4974' },
  red:    { background: '#fde2e2', color: '#8a1f1f' },
  orange: { background: '#fff4e2', color: '#8a571f' },
}
