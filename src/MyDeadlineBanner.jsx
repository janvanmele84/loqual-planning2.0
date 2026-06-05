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

export default function MyDeadlineBanner({ employee }) {
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    if (!employee?.id) return
    // Haal openstaande maanden op (komende 3 maand) waar:
    //   * een release bestaat voor minstens één van de winkels waar deze persoon kan werken
    //   * de bevestigings-deadline nog niet voorbij is
    //   * de persoon zelf nog niet bevestigd heeft
    const today = new Date()
    const monthStarts = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      monthStarts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    }

    const { data: status } = await supabase
      .from('shop_release_status')
      .select('month_start, confirm_deadline, days_until_confirm, released_at')
      .in('month_start', monthStarts)
    if (!status) return

    const { data: subs } = await supabase
      .from('availability_submissions')
      .select('month_start, confirmed_at')
      .eq('employee_id', employee.id)
      .in('month_start', monthStarts)
    const confirmed = new Set((subs || []).filter((s) => s.confirmed_at).map((s) => s.month_start))

    // Per maand: één rij — als er minstens één released winkel is en deze persoon nog niet bevestigd
    const byMonth = {}
    status.forEach((r) => {
      if (!r.released_at) return
      if (confirmed.has(r.month_start)) return
      if (r.days_until_confirm < 0) return
      if (!byMonth[r.month_start]) byMonth[r.month_start] = r
    })
    setItems(Object.values(byMonth).sort((a, b) => a.month_start.localeCompare(b.month_start)).slice(0, 2))
  }, [employee?.id])

  useEffect(() => { load() }, [load])

  if (items.length === 0) return null

  return (
    <div style={{ marginBottom: 14 }}>
      {items.map((it) => {
        const urgent = it.days_until_confirm <= 3
        const c = urgent ? styles.red : styles.green
        return (
          <div key={it.month_start} style={styles.row(c)}>
            <div>
              <strong>{monthLabel(it.month_start)}</strong> staat open — geef je dagen door en klik op "Bevestigen".
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Deadline: <strong>{dateLabel(it.confirm_deadline)}</strong> (nog {it.days_until_confirm} {daysWord(it.days_until_confirm)}). Wie niets bevestigt wordt automatisch als afgekocht beschouwd.
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  red:   { bg: '#fde2e2', fg: '#8a1f1f', border: '#c33' },
  green: { bg: '#e8efe4', fg: '#2f5a31', border: '#6a8e6a' },
  row: (p) => ({
    background: p.bg, color: p.fg, border: `1px solid ${p.border}`,
    borderRadius: 12, padding: '10px 14px', marginBottom: 6, fontSize: 14, lineHeight: 1.4,
  }),
}
