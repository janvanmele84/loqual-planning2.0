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
function daysWord(n) { return n === 1 ? 'dag' : 'dagen' }

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
    // Toon maanden waar een actie of melding nuttig is
    const visible = (data || []).filter((d) => {
      if (d.status === 'published') return false
      if (d.status === 'overdue') return true
      if (d.status === 'auto') return true
      if (d.status === 'released') return d.days_until_publish <= 30
      if (d.status === 'pending') return d.days_until_release <= 60
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
        if (it.status === 'overdue' || it.status === 'pending') {
          // Vrijgave hangt nog open
          const isPast = it.status === 'overdue'
          return (
            <div key={it.month_start} style={styles.row(isPast ? styles.red : styles.green)}>
              <div style={{ flex: 1 }}>
                <strong>{monthLabel(it.month_start)}</strong> nog vrij te geven
                {' · '}
                {isPast
                  ? `deadline was ${dateLabel(it.release_deadline)}`
                  : `nog ${it.days_until_release} ${daysWord(it.days_until_release)} (uiterlijk ${dateLabel(it.release_deadline)})`}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Voor je vrijgeeft: kijk of de openingsdagen kloppen (verplichte openingen in shoppingcentra, braderieën, feestdagen, …).
                </div>
              </div>
              <button className={isPast ? 'btn btn-primary' : 'btn'} disabled={busy} onClick={() => doRelease(it.month_start)} style={{ whiteSpace: 'nowrap' }}>
                Vrijgeven
              </button>
            </div>
          )
        }
        // Vrijgegeven (manueel of auto) — toon volgende deadlines
        return (
          <div key={it.month_start} style={styles.row(styles.blue)}>
            <div style={{ flex: 1 }}>
              <strong>{monthLabel(it.month_start)}</strong>
              {it.status === 'auto' ? ' werd automatisch vrijgegeven' : ' is vrijgegeven'}
              {' · '}
              {it.days_until_confirm > 0
                ? <>medewerkers bevestigen tegen <strong>{dateLabel(it.confirm_deadline)}</strong> (nog {it.days_until_confirm} {daysWord(it.days_until_confirm)})</>
                : it.days_until_publish > 0
                  ? <>planning publiceren tegen <strong>{dateLabel(it.publish_deadline)}</strong> (nog {it.days_until_publish} {daysWord(it.days_until_publish)})</>
                  : <>planning wordt vandaag automatisch gepubliceerd</>}
            </div>
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
  blue:   { bg: '#e6eef5', fg: '#1f4974', border: '#6a8eaa' },
  row: (p) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    background: p.bg, color: p.fg, border: `1px solid ${p.border}`,
    borderRadius: 12, padding: '10px 14px', marginBottom: 6, fontSize: 14, lineHeight: 1.35,
  }),
}

