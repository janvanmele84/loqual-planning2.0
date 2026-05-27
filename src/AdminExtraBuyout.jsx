import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function AdminExtraBuyout() {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [month, setMonth] = useState(addMonths(thisMonth, -1))
  const monthStart = ymd(month)
  const monthLabel = `${MONTHS[month.getMonth()]} ${month.getFullYear()}`
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.rpc('admin_extra_buyout', { p_month: monthStart })
      if (!active) return
      setRows(data || [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [monthStart])

  const canPrev = month > addMonths(thisMonth, -24)
  const canNext = month < thisMonth

  function exportCsv() {
    downloadCsv(
      `extra-afkoop-${monthStart}.csv`,
      ['Voornaam', 'Familienaam', 'Bedrijfsnaam',
        'Verplicht', 'Gepresteerd', 'Extra',
        'Afgekochte winkels', 'Vorige maand gepresteerd', 'Volgende maand gepland'],
      rows.map((r) => [
        r.first_name, r.last_name || '', r.company_name || '',
        r.verplicht, r.gepresteerd, r.extra,
        r.afgekocht_winkels || '', r.vorige_maand_gepresteerd, r.volgende_maand_gepland,
      ]),
    )
  }

  return (
    <>
      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>‹</button>
        <strong>{monthLabel}</strong>
        <button className="icon-btn" onClick={() => canNext && setMonth(addMonths(month, 1))} disabled={!canNext}>›</button>
      </div>

      <div className="card">
        <div className="section-title">Afkopen & extra uitbatingen — {monthLabel}</div>
        <div className="hint" style={{ marginTop: 0 }}>
          Ondernemers die deze maand minstens één dag afkochten, of meer dagen presteerden dan hun verplichting.
          De laatste twee kolommen tonen wat ze de maand ervoor presteerden en de maand erna ingepland staan, zodat
          je een mogelijk inhaalpatroon ziet.
        </div>

        {loading ? (
          <div className="muted">Laden…</div>
        ) : rows.length === 0 ? (
          <div className="muted">Niemand kocht af of presteerde extra deze maand.</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={th}>Ondernemer</th>
                    <th style={thR}>Verplicht</th>
                    <th style={thR}>Gepresteerd</th>
                    <th style={thR}>Extra</th>
                    <th style={th}>Afgekocht</th>
                    <th style={thR}>Vorige maand</th>
                    <th style={thR}>Volgende maand</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.entrepreneur_id}>
                      <td style={td}>
                        {r.first_name}{r.last_name ? ' ' + r.last_name : ''}
                        {r.company_name && <div className="muted" style={{ fontSize: 12 }}>{r.company_name}</div>}
                      </td>
                      <td style={tdR}>{r.verplicht}</td>
                      <td style={tdR}>{r.gepresteerd}</td>
                      <td style={{ ...tdR, color: r.extra > 0 ? 'var(--clay)' : 'inherit', fontWeight: r.extra > 0 ? 600 : 400 }}>
                        {r.extra > 0 ? '+' + r.extra : ''}
                      </td>
                      <td style={td}>
                        {r.afgekocht_count > 0 ? (
                          <span>
                            <strong>{r.afgekocht_count}</strong>
                            <span className="muted" style={{ fontSize: 12 }}> · {r.afgekocht_winkels}</span>
                          </span>
                        ) : ''}
                      </td>
                      <td style={tdR}>{r.vorige_maand_gepresteerd}</td>
                      <td style={tdR}>{r.volgende_maand_gepland}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-block" style={{ marginTop: 12 }} onClick={exportCsv}>
              Exporteer naar CSV
            </button>
          </>
        )}
      </div>
    </>
  )
}

function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }
const th = { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid var(--line)', fontWeight: 600 }
const thR = { ...th, textAlign: 'right' }
const td = { padding: '7px 6px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' }
const tdR = { ...td, textAlign: 'right' }
