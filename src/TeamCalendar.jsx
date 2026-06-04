import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const WEEK = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)

export default function TeamCalendar({ employee, allShops = false }) {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [shops, setShops] = useState([])
  const [shopId, setShopId] = useState(null)
  const [month, setMonth] = useState(thisMonth)
  const [published, setPublished] = useState(false)
  const [byDay, setByDay] = useState({}) // 'yyyy-mm-dd' -> [{first_name, role}]
  const [loading, setLoading] = useState(true)

  const monthStart = ymd(month)

  // Winkels laden
  useEffect(() => {
    let active = true
    ;(async () => {
      let data
      if (allShops) {
        const { data: d } = await supabase
          .from('shops')
          .select('id, name')
          .eq('active', true)
          .order('name')
        data = d
      } else {
        const { data: d } = await supabase.rpc('my_schedule_shops')
        data = d
      }
      if (!active) return
      setShops(data || [])
      if ((data || []).length && !shopId) setShopId(data[0].id)
      if (!(data || []).length) setLoading(false)
    })()
    return () => { active = false }
  }, [allShops]) // eslint-disable-line

  const load = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
    const [{ data: pub }, { data: rows }] = await Promise.all([
      supabase.rpc('month_is_published', { p_shop: shopId, p_month: monthStart }),
      supabase.rpc('published_schedule', { p_shop: shopId, p_month: monthStart }),
    ])
    setPublished(!!pub)
    const map = {}
    ;(rows || []).forEach((r) => {
      if (!map[r.shift_date]) map[r.shift_date] = []
      map[r.shift_date].push(r)
    })
    setByDay(map)
    setLoading(false)
  }, [shopId, monthStart])

  useEffect(() => { load() }, [load])

  // Kalenderopbouw
  const firstWd = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstWd; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const str = ymd(new Date(month.getFullYear(), month.getMonth(), d))
    cells.push({ d, str, people: byDay[str] || [] })
  }

  const canPrev = month > addMonths(thisMonth, -4)
  const canNext = month < addMonths(thisMonth, 6)

  if (shops.length === 0 && !loading) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="section-title">Geen winkels</div>
        <div className="muted">Je bent nog niet aan een winkel gekoppeld, dus er is nog geen planning om te tonen.</div>
      </div>
    )
  }

  return (
    <>
      {shops.length > 1 && (
        <div className="pills" style={{ marginBottom: 10 }}>
          {shops.map((s) => (
            <button key={s.id}
              className={'pill' + (s.id === shopId ? ' active' : '')}
              onClick={() => setShopId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>‹</button>
        <span className="label">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <button className="icon-btn" onClick={() => canNext && setMonth(addMonths(month, 1))} disabled={!canNext}>›</button>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
      ) : !published ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="section-title">Nog niet gepubliceerd</div>
          <div className="muted">De planning voor deze maand is nog niet gepubliceerd.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {WEEK.map((w) => (
              <div key={w} style={{ fontSize: 11, textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((c, i) => {
              if (!c) return <div key={'b' + i} />
              const has = c.people.length > 0
              return (
                <div key={c.str} style={{
                  minHeight: 64, borderRadius: 8, padding: '4px 4px 6px',
                  border: '1px solid var(--line)',
                  background: has ? 'var(--surface)' : '#faf8f5',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{c.d}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {c.people.map((p, j) => (
                      <span key={j} style={{
                        fontSize: 11, lineHeight: 1.25, fontWeight: 600,
                        color: p.role === 'ondernemer' ? 'var(--ink)' : '#2d4a7a',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {p.first_name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hint" style={{ marginBottom: 0, marginTop: 10 }}>
            Donker = ondernemer, blauw = flexi of jobstudent.
          </div>
        </div>
      )}
    </>
  )
}
