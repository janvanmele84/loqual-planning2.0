import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
function monthLabel(iso) {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
function dayName(iso) {
  const d = new Date(iso)
  const NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
  return `${NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
function pad(n) { return String(n).padStart(2, '0') }
function icsDateTime(date, time) {
  // date = 'yyyy-mm-dd', time = 'HH:MM:SS' or 'HH:MM'
  const [y, m, d] = date.split('-')
  const [hh, mm] = (time || '00:00').split(':')
  return `${y}${m}${d}T${pad(hh)}${pad(mm)}00`
}

export default function MyMonthOverview({ employee, onClose }) {
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const monthStart = ymd(month)

  const load = useCallback(async () => {
    if (!employee?.id) return
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase.rpc('my_assignments_month', {
        p_employee_id: employee.id, p_month: monthStart,
      })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setError(e?.message || String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [employee?.id, monthStart])

  useEffect(() => { load() }, [load])

  function asText() {
    if (rows.length === 0) return `Mijn maand — ${monthLabel(monthStart)}: niets ingepland.`
    const lines = [`Mijn maand — ${monthLabel(monthStart)}`]
    rows.forEach((r) => {
      lines.push(`${dayName(r.shift_date)} — ${r.shop_name} (${(r.start_time || '').slice(0,5)}–${(r.end_time || '').slice(0,5)})`)
    })
    return lines.join('\n')
  }

  function copyText() {
    navigator.clipboard.writeText(asText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function downloadICS() {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Loqual//Planning//NL',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ]
    rows.forEach((r, i) => {
      const start = icsDateTime(r.shift_date, r.start_time || '10:00')
      const end = icsDateTime(r.shift_date, r.end_time || '18:00')
      const uid = `loqual-${employee.id}-${r.shift_date}-${i}@loqual.be`
      const desc = `Loqual: ${r.shop_name}${r.kind === 'mandatory' ? ' (uitbatingsdag)' : ' (extra)'}`
      ics.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${icsDateTime(monthStart, '00:00')}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${r.shop_name}`,
        `DESCRIPTION:${desc}`,
        r.shop_address ? `LOCATION:${r.shop_address.replace(/\n/g, ', ')}` : 'LOCATION:',
        'END:VEVENT',
      )
    })
    ics.push('END:VCALENDAR')
    const blob = new Blob([ics.join('\r\n')], { type: 'text/calendar;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loqual_${monthStart}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  function setRel(diff) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + diff, 1))
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Mijn maand</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div className="monthnav" style={{ marginBottom: 14 }}>
          <button className="icon-btn" onClick={() => setRel(-1)}>‹</button>
          <span className="label">{monthLabel(monthStart)}</span>
          <button className="icon-btn" onClick={() => setRel(1)}>›</button>
        </div>

        {error && <div className="msg err">{error}</div>}

        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
        ) : rows.length === 0 ? (
          <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
            Geen ingeplande dagen voor deze maand.
          </div>
        ) : (
          <>
            <div style={list}>
              {rows.map((r, i) => (
                <div key={i} style={row}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{dayName(r.shift_date)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {(r.start_time || '').slice(0,5)} – {(r.end_time || '').slice(0,5)}
                      {r.kind !== 'mandatory' && <> · <em>extra</em></>}
                      {r.makeup_for_month && <> · ⏪ inhaaldag</>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 500 }}>{r.shop_name}</div>
                    {r.shop_address && <div className="muted" style={{ fontSize: 11 }}>{r.shop_address}</div>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={downloadICS}>
                📅 Voeg toe aan agenda (.ics)
              </button>
              <button className="btn" onClick={copyText}>
                {copied ? '✓ Gekopieerd' : '📋 Kopieer overzicht'}
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Het .ics-bestand kun je openen in Google Agenda, Apple Calendar of Outlook om alle dagen tegelijk te importeren.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, zIndex: 1000,
}
const dialog = {
  background: 'var(--surface, #fff)', borderRadius: 14, padding: 18,
  maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto',
}
const list = { background: 'var(--surface-2, #faf8f5)', borderRadius: 10, padding: 8 }
const row = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 10px', borderBottom: '1px solid var(--line)',
}
const closeBtn = { background: 'transparent', border: 0, fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }
