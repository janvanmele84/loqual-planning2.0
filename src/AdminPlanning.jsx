import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
function firstOfNextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function monthName(d) {
  return d.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
}

// Bouw kalenderraster: leading blanks + alle dagen van de maand
function buildCalendarGrid(monthStart) {
  const days = []
  const first = new Date(monthStart)
  const last = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  // Nederlandse week begint op maandag: getDay() 0=zo → 6, 1=ma → 0
  const firstDayOfWeek = (first.getDay() + 6) % 7
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(first.getFullYear(), first.getMonth(), d))
  }
  return days
}

export default function AdminPlanning() {
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(new Date()))
  const [shops, setShops] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: shopsData } = await supabase
        .from('shops')
        .select('id, name')
        .eq('active', true)
        .order('name')
      setShops(shopsData || [])

      const { data: rowsData, error } = await supabase.rpc('admin_planning_month', {
        p_month: ymd(monthStart),
      })
      if (error) throw error
      setRows(rowsData || [])
    } finally {
      setLoading(false)
    }
  }, [monthStart])

  useEffect(() => { load() }, [load])

  // Map "shop_id:YYYY-MM-DD" -> array van namen (of [] als shift zonder assignments)
  const shiftMap = useMemo(() => {
    const m = new Map()
    rows.forEach((r) => {
      const key = `${r.shop_id}:${r.shift_date}`
      const existing = m.get(key) || []
      // employee_id kan null zijn (shift zonder assignments)
      if (r.employee_id) {
        existing.push(r.first_name || '?')
      }
      m.set(key, existing)
    })
    return m
  }, [rows])

  const days = useMemo(() => buildCalendarGrid(monthStart), [monthStart])

  // Aantal gaten per winkel: shifts zonder assignments
  const gapsPerShop = useMemo(() => {
    const m = new Map()
    shops.forEach((s) => m.set(s.id, 0))
    // Groepeer per shop+datum, tel unieke datums met 0 employees
    const shiftIndex = new Map()
    rows.forEach((r) => {
      const key = `${r.shop_id}:${r.shift_date}`
      if (!shiftIndex.has(key)) {
        shiftIndex.set(key, { shop_id: r.shop_id, hasEmployee: false })
      }
      if (r.employee_id) shiftIndex.get(key).hasEmployee = true
    })
    shiftIndex.forEach((v) => {
      if (!v.hasEmployee) {
        m.set(v.shop_id, (m.get(v.shop_id) || 0) + 1)
      }
    })
    return m
  }, [shops, rows])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn" onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}>◀</button>
        <div style={{ fontSize: 18, fontWeight: 600, minWidth: 180, textAlign: 'center', textTransform: 'capitalize' }}>
          {monthName(monthStart)}
        </div>
        <button className="btn" onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}>▶</button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: 'var(--muted)', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Legend color="#e8f4e8" border="#b8dbb8" label="Ingepland" />
        <Legend color="#fff3cd" border="#f0c040" label="Nog geen ingeplanden" />
        <Legend color="#f5f5f5" border="#e5e5e5" label="Winkel dicht" />
      </div>

      {loading ? (
        <div className="muted" style={{ textAlign: 'center', padding: 20 }}>Laden…</div>
      ) : shops.length === 0 ? (
        <div className="muted" style={{ textAlign: 'center', padding: 20 }}>Geen actieve winkels.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {shops.map((shop) => (
            <ShopCalendar
              key={shop.id}
              shop={shop}
              days={days}
              shiftMap={shiftMap}
              gaps={gapsPerShop.get(shop.id) || 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Legend({ color, border, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-block', width: 14, height: 14, background: color, border: `1px solid ${border}`, borderRadius: 3 }} />
      {label}
    </span>
  )
}

function ShopCalendar({ shop, days, shiftMap, gaps }) {
  const dayHeaders = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{shop.name}</div>
        {gaps > 0 && (
          <span className="tag niet" style={{ fontSize: 10 }}>{gaps} {gaps === 1 ? 'gat' : 'gaten'}</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {dayHeaders.map((h) => (
          <div key={h} style={{ fontSize: 10, textAlign: 'center', color: 'var(--muted)', fontWeight: 500, paddingBottom: 2 }}>
            {h}
          </div>
        ))}
        {days.map((day, idx) => {
          if (!day) return <div key={idx} style={{ height: 40 }} />
          const key = `${shop.id}:${ymd(day)}`
          const names = shiftMap.get(key)
          const closed = names === undefined
          const empty = !closed && names.length === 0
          const dayNum = day.getDate()

          if (closed) {
            return (
              <div
                key={idx}
                style={{
                  height: 40, background: '#f5f5f5', border: '1px solid #e5e5e5',
                  borderRadius: 3, fontSize: 10, color: '#bbb',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '2px 4px',
                }}
              >
                {dayNum}
              </div>
            )
          }

          if (empty) {
            return (
              <div
                key={idx}
                style={{
                  height: 40, background: '#fff3cd', border: '1px solid #f0c040',
                  borderRadius: 3, fontSize: 10, color: '#8a571f',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '2px 4px',
                }}
                title="Nog niemand ingepland"
              >
                {dayNum}
              </div>
            )
          }

          const namesText = names.join(', ')
          return (
            <div
              key={idx}
              style={{
                height: 40, background: '#e8f4e8', border: '1px solid #b8dbb8',
                borderRadius: 3, display: 'flex', flexDirection: 'column',
                padding: '2px 4px', overflow: 'hidden',
              }}
              title={namesText}
            >
              <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right', lineHeight: 1 }}>{dayNum}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, lineHeight: 1.2, marginTop: 2 }}>
                {namesText}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
