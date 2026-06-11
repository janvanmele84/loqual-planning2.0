import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell.jsx'
import AdminExtraBuyout from './AdminExtraBuyout.jsx'
import BoekhoudingReport from './BoekhoudingReport.jsx'

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
  const [tab, setTab] = useState('uit') // 'uit' | 'werk' | 'detail'
  const [loading, setLoading] = useState(true)
  const [uit, setUit] = useState([])
  const [werk, setWerk] = useState([])
  const [detail, setDetail] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [u, w, d] = await Promise.all([
        supabase.rpc('boekhouding_uitbatingen', { p_month: monthStart }),
        supabase.rpc('boekhouding_werkers', { p_month: monthStart }),
        supabase.rpc('boekhouding_detail', { p_month: monthStart }),
      ])
      if (!active) return
      setUit(u.data || [])
      setWerk(w.data || [])
      setDetail(d.data || [])
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
      ['Voornaam', 'Familienaam', 'Rol', 'E-mail', 'Winkel', 'Gewerkte dagen'],
      werk.map((r) => [r.first_name, r.last_name || '', r.role, r.email, r.shop_name, r.gewerkt]),
    )
  }
  function exportDetail() {
    downloadCsv(
      `detail-${monthStart}.csv`,
      ['Datum', 'Soort', 'Voornaam', 'Familienaam', 'Rol', 'Bedrijfsnaam', 'Winkel'],
      detail.map((r) => [
        r.day, r.soort, r.first_name, r.last_name || '', r.role, r.company_name || '', r.shop_name,
      ]),
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
        <button className={'tab' + (tab === 'detail' ? ' active' : '')} onClick={() => setTab('detail')}>
          Detail per dag
        </button>
        <button className={'tab' + (tab === 'extra' ? ' active' : '')} onClick={() => setTab('extra')}>
          Extra & afkoop
        </button>
        <button className={'tab' + (tab === 'afwijkingen' ? ' active' : '')} onClick={() => setTab('afwijkingen')}>
          Afwijkingen
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
      ) : tab === 'werk' ? (
        <div className="card">
          <div className="section-title">Flexi's & jobstudenten — {monthLabel}</div>
          <div className="hint" style={{ marginTop: 0 }}>
            Wie heeft effectief gewerkt deze maand, in welke winkel en hoeveel dagen. Iemand die in meerdere winkels
            werkte, staat met één rij per winkel.
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
                      <th style={th}>Winkel</th>
                      <th style={thR}>Gewerkte dagen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {werk.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>
                          {r.first_name}{r.last_name ? ' ' + r.last_name : ''}
                          <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
                        </td>
                        <td style={td}>{r.role === 'flexi' ? 'Flexi' : 'Jobstudent'}</td>
                        <td style={td}>{r.shop_name}</td>
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
      ) : tab === 'detail' ? (
        <div className="card">
          <div className="section-title">Detail per dag — {monthLabel}</div>
          <div className="hint" style={{ marginTop: 0 }}>
            Chronologische lijst van élke afkoop, uitbating, extra uitbating en werkdag, met de winkel waar het
            voor telt (bij overgenomen dagen = de thuiswinkel van de ondernemer).
          </div>
          {detail.length === 0 ? (
            <div className="muted">Niets geregistreerd in deze maand.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
                <table style={tbl}>
                  <thead>
                    <tr>
                      <th style={th}>Datum</th>
                      <th style={th}>Soort</th>
                      <th style={th}>Persoon</th>
                      <th style={th}>Winkel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.day}</td>
                        <td style={td}>
                          <span style={soortBadge(r.soort)}>{r.soort}</span>
                        </td>
                        <td style={td}>
                          {r.first_name}{r.last_name ? ' ' + r.last_name : ''}
                          {r.company_name && <span className="muted" style={{ fontSize: 12 }}> · {r.company_name}</span>}
                        </td>
                        <td style={td}>{r.shop_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-block" style={{ marginTop: 12 }} onClick={exportDetail}>
                Exporteer naar CSV
              </button>
            </>
          )}
        </div>
      ) : tab === 'extra' ? (
        <AdminExtraBuyout />
      ) : (
        <BoekhoudingReport />
      )}
    </Shell>
  )
}

function soortBadge(soort) {
  const colors = {
    afkoop:            { bg: '#fff2dd', fg: '#8a5a17' },
    uitbating:         { bg: 'var(--ok-bg, #e8efe4)', fg: 'var(--ok, #2f5a31)' },
    'extra-uitbating': { bg: '#e8eef7', fg: '#2d4a7a' },
    werkdag:           { bg: '#f1ebe5', fg: '#5a4837' },
  }
  const c = colors[soort] || { bg: '#eee', fg: '#333' }
  return {
    background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 6,
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  }
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
