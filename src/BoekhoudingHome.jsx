import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell.jsx'

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function BoekhoudingHome({ employee, onLogout }) {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [month, setMonth] = useState(addMonths(thisMonth, -1))
  const monthStart = ymd(month)
  const monthLabel = `${MONTHS[month.getMonth()]} ${month.getFullYear()}`
  const [tab, setTab] = useState('uit') // 'uit' | 'werk'
  const [loading, setLoading] = useState(true)
  const [uit, setUit] = useState([])
  const [werk, setWerk] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [u, w] = await Promise.all([
        supabase.rpc('boekhouding_uitbatingen', { p_month: monthStart }),
        supabase.rpc('boekhouding_werkers', { p_month: monthStart }),
      ])
      if (!active) return
      setUit(u.data || [])
      setWerk(w.data || [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [monthStart])

  const canPrev = month > addMonths(thisMonth, -24)
  const canNext = month < thisMonth

  function exportUitbatingen() {
    downloadCsv(
      `uitbatingen-${monthStart}.csv`,
      ['Winkel', 'Voornaam', 'Familienaam', 'Bedrijfsnaam', 'Verplicht', 'Gepresteerd', 'Afgekocht', 'Verschil'],
      uit.map((r) => [
        r.shop_name, r.first_name, r.last_name || '', r.company_name || '',
        r.verplicht, r.gepresteerd, r.afgekocht ? 'ja' : 'nee', r.verschil,
      ]),
    )
  }
  function exportWerkers() {
    downloadCsv(
      `werkers-${monthStart}.csv`,
      ['Voornaam', 'Familienaam', 'Rol', 'E-mail', 'Gewerkte dagen'],
      werk.map((r) => [r.first_name, r.last_name || '', r.role, r.email, r.gewerkt]),
    )
  }

  return (
    <Shell employee={employee} onLogout={onLogout}>
      <div className="section-title" style={{ marginBottom: 12 }}>Boekhouding</div>

      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>‹</button>
        <strong>{monthLabel}</strong>
        <button className="icon-btn" onClick={() => canNext && setMonth(addMonths(month, 1))} disabled={!canNext}>›</button>
      </div>

      <div className="tabs">
        <button className={'tab' + (tab === 'uit' ? ' active' : '')} onClick={() => setTab('uit')}>
          Uitbatingen
        </button>
        <button className={'tab' + (tab === 'werk' ? ' active' : '')} onClick={() => setTab('werk')}>
          Flexi's & jobstudenten
        </button>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
      ) : tab === 'uit' ? (
        <div className="card">
          <div className="section-title">Uitbatingen — {monthLabel}</div>
          <div className="hint" style={{ marginTop: 0 }}>
            Wie heeft in welke winkel uitgebaat, en wat is het verschil met zijn verplichte aantal dagen. Een
            negatief verschil = te weinig gepresteerd. "Afgekocht" betekent dat de ondernemer die maand voor die
            winkel een dag heeft afgekocht.
          </div>
          {uit.length === 0 ? (
            <div className="muted">Geen gegevens voor deze maand.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={tbl}>
                  <thead>
                    <tr>
                      <th style={th}>Winkel</th>
                      <th style={th}>Ondernemer</th>
                      <th style={thR}>Verplicht</th>
                      <th style={thR}>Gepresteerd</th>
                      <th style={thR}>Afgekocht</th>
                      <th style={thR}>Verschil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uit.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.shop_name}</td>
                        <td style={td}>
                          {r.first_name}{r.last_name ? ' ' + r.last_name : ''}
                          {r.company_name && <span className="muted" style={{ fontSize: 12 }}> · {r.company_name}</span>}
                        </td>
                        <td style={tdR}>{r.verplicht}</td>
                        <td style={tdR}>{r.gepresteerd}</td>
                        <td style={tdR}>{r.afgekocht ? 'ja' : ''}</td>
                        <td style={{ ...tdR, color: r.verschil < 0 ? 'var(--danger)' : r.verschil > 0 ? 'var(--clay)' : 'inherit', fontWeight: 600 }}>
                          {r.verschil > 0 ? '+' + r.verschil : r.verschil}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-block" style={{ marginTop: 12 }} onClick={exportUitbatingen}>
                Exporteer naar CSV
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="section-title">Flexi's & jobstudenten — {monthLabel}</div>
          <div className="hint" style={{ marginTop: 0 }}>
            Wie heeft effectief gewerkt in deze maand, en hoeveel dagen. Bedoeld voor factuurcontrole.
          </div>
          {werk.length === 0 ? (
            <div className="muted">Niemand heeft gewerkt in deze maand.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={tbl}>
                  <thead>
                    <tr>
                      <th style={th}>Naam</th>
                      <th style={th}>Rol</th>
                      <th style={th}>E-mail</th>
                      <th style={thR}>Gewerkte dagen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {werk.map((r) => (
                      <tr key={r.employee_id}>
                        <td style={td}>{r.first_name}{r.last_name ? ' ' + r.last_name : ''}</td>
                        <td style={td}>{r.role === 'flexi' ? 'Flexi' : 'Jobstudent'}</td>
                        <td style={td}>{r.email}</td>
                        <td style={{ ...tdR, fontWeight: 600 }}>{r.gewerkt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-block" style={{ marginTop: 12 }} onClick={exportWerkers}>
                Exporteer naar CSV
              </button>
            </>
          )}
        </div>
      )}
    </Shell>
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
