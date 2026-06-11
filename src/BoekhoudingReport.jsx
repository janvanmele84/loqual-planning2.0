import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
function monthLabel(iso) {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
function dateLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export default function BoekhoudingReport() {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [month, setMonth] = useState(thisMonth)
  const [shops, setShops] = useState([])
  const [shopFilter, setShopFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false) // toon alleen afwijkingen of alle
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const monthStart = ymd(month)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('shops').select('id, name').eq('active', true).order('name')
      setShops(data || [])
    })()
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase.rpc('accounting_export', {
        p_month: monthStart, p_shop: shopFilter || null,
      })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setError(e?.message || String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [monthStart, shopFilter])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter((r) => {
    if (!showAll) {
      // Alleen afwijkingen tonen
      const noActivity = r.regular_done === 0 && r.makeup_in === 0 && r.bought_out === 0 && r.shifted_out === 0 && r.extra_done === 0
      const isException = r.saldo !== 0 || r.extra_done > 0 || r.makeup_in > 0 || r.shifted_out > 0 || (r.bought_out > 0 && r.quota === 0)
      if (!isException && !(noActivity && r.quota > 0)) return false
    }
    if (search) {
      const s = search.toLowerCase()
      const hit = [r.first_name, r.last_name, r.company_name, r.shop_name].some((v) => (v || '').toLowerCase().includes(s))
      if (!hit) return false
    }
    return true
  })

  function downloadCSV() {
    const headers = [
      'Winkel','Voornaam','Familienaam','Bedrijf','Maand',
      'Verplicht','Gepresteerd','Inhaal in','Verschoven uit','Verschoven naar',
      'Afgekocht (dagen)','Afkoopbedrag','Reden afkoop','Extra dagen','Totaal toegerekend','Saldo','Toelichting',
    ]
    const lines = [headers.join(',')]
    filtered.forEach((r) => {
      lines.push([
        r.shop_name, r.first_name, r.last_name || '', r.company_name || '',
        monthLabel(r.month_start),
        r.quota, r.regular_done, r.makeup_in, r.shifted_out, r.shifted_to ? monthLabel(r.shifted_to) : '',
        r.bought_out, r.bought_out_amount, r.bought_out_reason || '',
        r.extra_done, r.total_credited, r.saldo, r.toelichting || '',
      ].map(csvEscape).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loqual_boekhouding_${monthStart}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function setRel(diff) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + diff, 1))
  }

  return (
    <>
      <div className="monthnav">
        <button className="icon-btn" onClick={() => setRel(-1)}>‹</button>
        <span className="label">{monthLabel(monthStart)}</span>
        <button className="icon-btn" onClick={() => setRel(1)}>›</button>
      </div>

      <div className="card">
        <div className="section-title">Boekhouding-rapport</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Eén rij per (ondernemer × winkel) voor de gekozen maand. Inhaaldagen tellen voor hun thuismaand, niet als extra kost.
        </div>

        <label className="flbl">Winkel</label>
        <select className="input fw" value={shopFilter} onChange={(e) => setShopFilter(e.target.value)}>
          <option value="">Alle winkels</option>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label className="flbl" style={{ marginTop: 10 }}>Zoeken</label>
        <input className="input fw" type="text" value={search} placeholder="naam of bedrijf…" onChange={(e) => setSearch(e.target.value)} />

        <div className="row-item" style={{ marginTop: 10 }}>
          <span>Toon ook rijen zonder afwijking</span>
          <button className={'sw' + (showAll ? ' on' : '')} onClick={() => setShowAll(!showAll)}>
            <span className="knob" />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" onClick={downloadCSV} disabled={filtered.length === 0}>
            Exporteer als CSV ({filtered.length})
          </button>
          <button className="btn" onClick={load}>Herladen</button>
        </div>
      </div>

      {error && <div className="msg err">{error}</div>}

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">Geen rijen voor deze filter.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                <th style={th}>Winkel</th>
                <th style={th}>Ondernemer</th>
                <th style={th}>Quota</th>
                <th style={th}>Gepres.</th>
                <th style={th}>Inhaal in</th>
                <th style={th}>Versch. uit</th>
                <th style={th}>Afgek.</th>
                <th style={th}>Extra</th>
                <th style={th}>Saldo</th>
                <th style={th}>Toelichting</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={td}>{r.shop_name}</td>
                  <td style={td}>
                    {r.first_name} {r.last_name || ''}
                    {r.company_name && <div className="muted" style={{ fontSize: 10 }}>{r.company_name}</div>}
                  </td>
                  <td style={td}>{r.quota}</td>
                  <td style={td}>{r.regular_done}</td>
                  <td style={td}>{r.makeup_in || ''}</td>
                  <td style={td}>{r.shifted_out ? `${r.shifted_out} → ${monthLabel(r.shifted_to).slice(0,3)}` : ''}</td>
                  <td style={td}>{r.bought_out || ''}{r.bought_out_amount > 0 && <div className="muted" style={{ fontSize: 10 }}>€{Number(r.bought_out_amount).toFixed(0)}</div>}</td>
                  <td style={td}>{r.extra_done || ''}</td>
                  <td style={{ ...td, color: r.saldo === 0 ? 'inherit' : r.saldo < 0 ? '#c33' : '#8a571f', fontWeight: r.saldo !== 0 ? 600 : 400 }}>
                    {r.saldo > 0 ? `+${r.saldo}` : r.saldo}
                  </td>
                  <td style={td}>{r.toelichting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const th = { padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }
const td = { padding: '6px 6px', verticalAlign: 'top' }
