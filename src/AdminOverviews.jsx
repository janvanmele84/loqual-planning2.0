import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function monthLabel(iso) {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
function addMonths(iso, n) {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + n)
  return monthKey(d)
}

export default function AdminOverviews() {
  // -----------------------------------------------------------------------
  // Sectie 1 — uitbatingsdagen per winkel
  // -----------------------------------------------------------------------
  const [shopList, setShopList] = useState([])
  const [shopFilter, setShopFilter] = useState('all')
  const [entShopRows, setEntShopRows] = useState([])
  const [loading1, setLoading1] = useState(true)

  const loadOperate = useCallback(async () => {
    setLoading1(true)
    const [{ data: shops }, { data: es }] = await Promise.all([
      supabase.from('shops').select('id, name, owner_employee_id, active').order('name'),
      supabase
        .from('entrepreneur_shops')
        .select('shop_id, entrepreneur_id, operate_days, must_operate, employees!inner(id, first_name, last_name, company_name, active)'),
    ])
    setShopList((shops || []).filter((s) => s.active))
    const owners = {}
    ;(shops || []).forEach((s) => { if (s.owner_employee_id) owners[s.shop_id || s.id] = s.owner_employee_id })
    const ownerByShop = {}
    ;(shops || []).forEach((s) => { ownerByShop[s.id] = s.owner_employee_id })
    const rows = (es || [])
      .filter((r) => r.employees?.active)
      .map((r) => ({
        shop_id: r.shop_id,
        ondernemer_id: r.entrepreneur_id,
        name: [r.employees.first_name, r.employees.last_name].filter(Boolean).join(' '),
        company: r.employees.company_name || null,
        operate_days: r.operate_days || 1,
        must_operate: !!r.must_operate,
        is_owner: ownerByShop[r.shop_id] === r.entrepreneur_id,
      }))
    setEntShopRows(rows)
    setLoading1(false)
  }, [])

  useEffect(() => { loadOperate() }, [loadOperate])

  const groupedByShop = useMemo(() => {
    const groups = {}
    entShopRows.forEach((r) => {
      if (shopFilter !== 'all' && r.shop_id !== shopFilter) return
      if (!groups[r.shop_id]) groups[r.shop_id] = []
      groups[r.shop_id].push(r)
    })
    return groups
  }, [entShopRows, shopFilter])

  // -----------------------------------------------------------------------
  // Sectie 2 — beschikbaarheden status per maand
  // -----------------------------------------------------------------------
  const today = new Date()
  const defaultMonth = monthKey(new Date(today.getFullYear(), today.getMonth() + 1, 1))
  const [month, setMonth] = useState(defaultMonth)
  const [roleFilter, setRoleFilter] = useState('all')
  const [people, setPeople] = useState([])
  const [loading2, setLoading2] = useState(true)

  const loadAvail = useCallback(async () => {
    setLoading2(true)
    const { data: emps } = await supabase
      .from('employees')
      .select('id, first_name, last_name, company_name, role')
      .eq('active', true)
      .in('role', ['ondernemer', 'flexi', 'jobstudent'])
      .order('first_name')

    const { data: subs } = await supabase
      .from('availability_submissions')
      .select('id, employee_id, confirmed_at')
      .eq('month_start', month)

    const submap = {}
    ;(subs || []).forEach((s) => { submap[s.employee_id] = s })

    const ids = (subs || []).map((s) => s.id)
    let counts = {}
    if (ids.length) {
      const { data: ad } = await supabase
        .from('availability_days')
        .select('submission_id')
        .in('submission_id', ids)
      ;(ad || []).forEach((d) => {
        counts[d.submission_id] = (counts[d.submission_id] || 0) + 1
      })
    }

    const rows = (emps || []).map((e) => {
      const sub = submap[e.id]
      return {
        id: e.id,
        name: [e.first_name, e.last_name].filter(Boolean).join(' '),
        company: e.company_name || null,
        role: e.role,
        confirmed: !!sub?.confirmed_at,
        has_sub: !!sub,
        days: sub ? (counts[sub.id] || 0) : 0,
      }
    })
    setPeople(rows)
    setLoading2(false)
  }, [month])

  useEffect(() => { loadAvail() }, [loadAvail])

  const filteredPeople = useMemo(
    () => people.filter((p) => roleFilter === 'all' || p.role === roleFilter),
    [people, roleFilter],
  )
  const confirmedCount = filteredPeople.filter((p) => p.confirmed).length
  const totalCount = filteredPeople.length
  const notSubmitted = filteredPeople.filter((p) => !p.has_sub)
  const submittedNotConfirmed = filteredPeople.filter((p) => p.has_sub && !p.confirmed)

  return (
    <>
      {/* SECTIE 1 */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-title">Uitbatingsdagen per winkel</div>
        <select
          className="input fw"
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          style={{ marginBottom: 10 }}
        >
          <option value="all">Alle winkels</option>
          {shopList.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {loading1 ? (
          <div className="muted">Laden…</div>
        ) : Object.keys(groupedByShop).length === 0 ? (
          <div className="muted">Geen ondernemers gekoppeld.</div>
        ) : (
          shopList
            .filter((s) => groupedByShop[s.id])
            .map((s) => {
              const rs = groupedByShop[s.id]
              const totalDays = rs.filter((r) => r.must_operate).reduce((sum, r) => sum + r.operate_days, 0)
              return (
                <div key={s.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {s.name} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {totalDays} verplichte dag{totalDays === 1 ? '' : 'en'} totaal</span>
                  </div>
                  {rs
                    .slice()
                    .sort((a, b) => Number(b.must_operate) - Number(a.must_operate) || a.name.localeCompare(b.name))
                    .map((r) => (
                      <div className="row-item" key={r.shop_id + '-' + r.ondernemer_id}>
                        <span>
                          {r.name}
                          {r.company ? <span className="muted" style={{ marginLeft: 6, fontSize: 13 }}>· {r.company}</span> : null}
                          {r.is_owner && <span style={badgeOwner}>eigenaar</span>}
                        </span>
                        <span style={{ fontSize: 13 }}>
                          {r.must_operate ? (
                            <span style={badgeMust}>{r.operate_days} dag{r.operate_days === 1 ? '' : 'en'}</span>
                          ) : (
                            <span className="muted">geen verplichting</span>
                          )}
                        </span>
                      </div>
                    ))}
                </div>
              )
            })
        )}
      </div>

      {/* SECTIE 2 */}
      <div className="card">
        <div className="section-title">Beschikbaarheden — status per maand</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button className="btn" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>{monthLabel(month)}</div>
          <button className="btn" onClick={() => setMonth(addMonths(month, 1))}>›</button>
        </div>

        <div className="pills" style={{ marginBottom: 10 }}>
          {['all', 'ondernemer', 'flexi', 'jobstudent'].map((r) => (
            <button key={r} className={'pill' + (roleFilter === r ? ' active' : '')} onClick={() => setRoleFilter(r)}>
              {r === 'all' ? 'Alle' : r.charAt(0).toUpperCase() + r.slice(1) + (r === 'ondernemer' ? 's' : "'s")}
            </button>
          ))}
        </div>

        {loading2 ? (
          <div className="muted">Laden…</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              <strong>{confirmedCount}</strong> van {totalCount} bevestigd ·{' '}
              {submittedNotConfirmed.length} ingevuld maar nog niet bevestigd ·{' '}
              {notSubmitted.length} nog niets doorgegeven
            </div>

            {notSubmitted.length > 0 && (
              <details style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#8a1f1f' }}>
                  Nog niets doorgegeven ({notSubmitted.length})
                </summary>
                <div style={{ marginTop: 6 }}>
                  {notSubmitted.map((p) => (
                    <div className="row-item" key={p.id}>
                      <span>
                        {p.name}
                        {p.company ? <span className="muted" style={{ marginLeft: 6, fontSize: 13 }}>· {p.company}</span> : null}
                      </span>
                      <span style={{ ...badge, ...cell.gray }}>{p.role}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {submittedNotConfirmed.length > 0 && (
              <details style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#8a571f' }}>
                  Ingevuld maar niet bevestigd ({submittedNotConfirmed.length})
                </summary>
                <div style={{ marginTop: 6 }}>
                  {submittedNotConfirmed.map((p) => (
                    <div className="row-item" key={p.id}>
                      <span>
                        {p.name}
                        {p.company ? <span className="muted" style={{ marginLeft: 6, fontSize: 13 }}>· {p.company}</span> : null}
                      </span>
                      <span style={{ fontSize: 13 }}>{p.days} dag{p.days === 1 ? '' : 'en'} ingevuld</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#2f5a31' }}>
                Bevestigd ({confirmedCount})
              </summary>
              <div style={{ marginTop: 6 }}>
                {filteredPeople.filter((p) => p.confirmed).map((p) => (
                  <div className="row-item" key={p.id}>
                    <span>
                      {p.name}
                      {p.company ? <span className="muted" style={{ marginLeft: 6, fontSize: 13 }}>· {p.company}</span> : null}
                    </span>
                    <span style={{ fontSize: 13 }}>{p.days} dag{p.days === 1 ? '' : 'en'}</span>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </>
  )
}

const badge = { display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 12 }
const badgeOwner = { ...badge, background: '#e6eef5', color: '#1f4974', marginLeft: 8 }
const badgeMust = { ...badge, background: '#e8efe4', color: '#2f5a31' }
const cell = {
  gray: { background: '#eee', color: '#444' },
}
