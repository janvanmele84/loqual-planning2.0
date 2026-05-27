import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtEur = (n) => '€' + (Number(n) || 0).toFixed(0)

export default function BonusOverview({ filterManagerId }) {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [month, setMonth] = useState(addMonths(thisMonth, -1))
  const monthStart = ymd(new Date(month.getFullYear(), month.getMonth(), 1))
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [links, setLinks] = useState([])
  const [managers, setManagers] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [b, l, m] = await Promise.all([
        supabase.rpc('bonus_for_month', { p_month: monthStart }),
        supabase.from('shopmanager_shops').select('manager_id, shop_id'),
        supabase
          .from('employees')
          .select('id, first_name, last_name')
          .eq('role', 'shopmanager')
          .order('first_name'),
      ])
      if (!active) return
      setRows(b.data || [])
      setLinks(l.data || [])
      setManagers(m.data || [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [monthStart])

  const canPrev = month > addMonths(thisMonth, -12)
  const canNext = month < addMonths(thisMonth, 1)

  const shopBonus = new Map(rows.map((r) => [r.shop_id, r]))
  const byMgr = new Map()
  links.forEach((l) => {
    const b = shopBonus.get(l.shop_id)
    if (!b) return
    if (!byMgr.has(l.manager_id)) byMgr.set(l.manager_id, [])
    byMgr.get(l.manager_id).push(b)
  })
  let blocks = managers
    .map((m) => ({
      manager: m,
      shops: (byMgr.get(m.id) || []).slice().sort((a, b) => a.shop_name.localeCompare(b.shop_name)),
    }))
    .filter((b) => b.shops.length > 0)
  if (filterManagerId) blocks = blocks.filter((b) => b.manager.id === filterManagerId)

  const linkedShopIds = new Set(links.map((l) => l.shop_id))
  const unmanaged = rows.filter((r) => !linkedShopIds.has(r.shop_id))

  // Kort kaderend cijfertje: gemiddelde aantal openingsdagen (= drempel)
  const drempel = rows[0]?.drempel ?? 0

  return (
    <>
      <div className="monthnav">
        <button
          className="icon-btn"
          onClick={() => canPrev && setMonth(addMonths(month, -1))}
          disabled={!canPrev}
        >‹</button>
        <strong>{MONTHS[month.getMonth()]} {month.getFullYear()}</strong>
        <button
          className="icon-btn"
          onClick={() => canNext && setMonth(addMonths(month, 1))}
          disabled={!canNext}
        >›</button>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
      ) : rows.length === 0 ? (
        <div className="card"><div className="muted">Nog geen winkels.</div></div>
      ) : (
        <>
          <div className="hint" style={{ textAlign: 'center', marginTop: 0 }}>
            Drempel deze maand: <strong>{drempel}</strong> uitbatende/afkopende ondernemers (gemiddelde openingsdagen
            over alle winkels). Vanaf de drempel: €250, daarna +€75 per extra.
          </div>

          {blocks.length === 0 && filterManagerId ? (
            <div className="card"><div className="muted">Geen winkels onder jouw beheer voor deze maand.</div></div>
          ) : (
            blocks.map(({ manager, shops }) => {
              const total = shops.reduce((acc, s) => acc + Number(s.bonus || 0), 0)
              return (
                <div className="card" key={manager.id}>
                  <div className="section-title">
                    {manager.first_name}{manager.last_name ? ' ' + manager.last_name : ''}
                  </div>
                  {shops.map((s) => (
                    <div className="row-item" key={s.shop_id}>
                      <span style={{ minWidth: 0 }}>
                        <strong>{s.shop_name}</strong>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {s.open_dagen} open dagen · {s.aantal} uitbatend/afgekocht
                        </div>
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: Number(s.bonus) > 0 ? 'var(--clay)' : 'var(--muted)',
                          fontSize: 16,
                        }}
                      >
                        {fmtEur(s.bonus)}
                      </span>
                    </div>
                  ))}
                  {shops.length > 1 && (
                    <div
                      className="row-item"
                      style={{ borderBottom: 'none', paddingTop: 10, fontWeight: 700 }}
                    >
                      <span>Totaal</span>
                      <span style={{ color: total > 0 ? 'var(--clay)' : 'inherit', fontSize: 17 }}>
                        {fmtEur(total)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {!filterManagerId && unmanaged.length > 0 && (
            <div className="card">
              <div className="section-title">Winkels zonder manager</div>
              {unmanaged.map((s) => (
                <div className="row-item" key={s.shop_id}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{s.shop_name}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {s.open_dagen} open dagen · {s.aantal} uitbatend/afgekocht
                    </div>
                  </span>
                  <span className="muted">{fmtEur(s.bonus)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
