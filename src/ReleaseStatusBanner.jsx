import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function monthLabel(iso) {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
function dateLabel(iso) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export default function ReleaseStatusBanner({ shopId }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    if (!shopId) return
    const { data } = await supabase
      .from('shop_release_status')
      .select('*')
      .eq('shop_id', shopId)
      .order('month_start')
    const visible = (data || []).filter((d) => {
      if (d.status === 'overdue') return true
      if (d.status === 'auto') return true
      if (d.status === 'pending') return d.days_until_deadline <= 60
      return false
    }).slice(0, 4)
    setItems(visible)
  }, [shopId])

  useEffect(() => { load() }, [load])

  async function doRelease(monthStart) {
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.rpc('release_availability', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Vrijgeven mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) return null

  return (
    <div style={{ marginBottom: 14 }}>
      {items.map((it) => {
        if (it.status === 'overdue') {
          return (
            <div key={it.month_start} style={styles.row(styles.red)}>
              <div style={{ flex: 1 }}>
                <strong>{monthLabel(it.month_start)}</strong> is nog niet vrijgegeven — deadline was {dateLabel(it.deadline)}.
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={() => doRelease(it.month_start)} style={{ whiteSpace: 'nowrap' }}>
                Vrijgeven nu
              </button>
            </div>
          )
        }
        if (it.status === 'auto') {
          return (
            <div key={it.month_start} style={styles.row(styles.orange)}>
              <div style={{ flex: 1 }}>
                <strong>{monthLabel(it.month_start)}</strong> werd automatisch vrijgegeven (deadline {dateLabel(it.deadline)} overschreden).
              </div>
            </div>
          )
        }
        return (
          <div key={it.month_start} style={styles.row(styles.green)}>
            <div style={{ flex: 1 }}>
              <strong>{monthLabel(it.month_start)}</strong> nog vrij te geven · deadline {dateLabel(it.deadline)} ({it.days_until_deadline} {it.days_until_deadline === 1 ? 'dag' : 'dagen'}).
            </div>
            <button className="btn" disabled={busy} onClick={() => doRelease(it.month_start)} style={{ whiteSpace: 'nowrap' }}>
              Vrijgeven
            </button>
          </div>
        )
      })}
      {msg && <div className={'msg ' + (msg.kind === 'err' ? 'err' : 'good')}>{msg.text}</div>}
    </div>
  )
}

const styles = {
  red:    { bg: '#fde2e2', fg: '#8a1f1f', border: '#c33' },
  orange: { bg: '#fff4e2', fg: '#8a571f', border: '#d88' },
  green:  { bg: '#e8efe4', fg: '#2f5a31', border: '#6a8e6a' },
  row: (p) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    background: p.bg, color: p.fg, border: `1px solid ${p.border}`,
    borderRadius: 12, padding: '10px 14px', marginBottom: 6, fontSize: 14, lineHeight: 1.35,
  }),
}
