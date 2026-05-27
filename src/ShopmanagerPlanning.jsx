import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

const WEEK = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}
function leadingBlanks(date) {
  return (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7
}

export default function ShopmanagerPlanning({ employee, onLogout }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [managedShops, setManagedShops] = useState([])
  const [shopsMap, setShopsMap] = useState({})
  const [shopId, setShopId] = useState(null)
  const [month, setMonth] = useState(thisMonth)
  const [openSet, setOpenSet] = useState(new Set())
  const [byDate, setByDate] = useState({})
  const [pub, setPub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {kind:'remove',...} | {kind:'confirmplan'}

  const monthStart = ymd(firstOfMonth(month))
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))

  // Eenmalig: beheerde winkels + namenlijst van alle winkels (voor herverdeling-labels)
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: allShops } = await supabase.from('shops').select('id, name')
      const map = {}
      ;(allShops || []).forEach((s) => (map[s.id] = s.name))

      const { data: ms } = await supabase
        .from('shopmanager_shops')
        .select('shop_id')
        .eq('manager_id', employee.id)
      const managed = (ms || []).map((r) => ({ id: r.shop_id, name: map[r.shop_id] || 'Winkel' }))

      if (!active) return
      setShopsMap(map)
      setManagedShops(managed)
      setShopId((cur) => cur || managed[0]?.id || null)
      if (!managed.length) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [employee.id])

  const loadPlanning = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
    setMsg(null)
    try {
      const { data: sh } = await supabase
        .from('shifts')
        .select('shift_date')
        .eq('shop_id', shopId)
        .eq('kind', 'standard')
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
      setOpenSet(new Set((sh || []).map((r) => r.shift_date)))

      const { data: asgs } = await supabase
        .from('assignments')
        .select('id, kind, status, origin_shop_id, shifts!inner(shift_date, shop_id, kind), employees(first_name)')
        .eq('shifts.shop_id', shopId)
        .eq('shifts.kind', 'standard')
        .gte('shifts.shift_date', monthStart)
        .lte('shifts.shift_date', monthEnd)
      const map = {}
      ;(asgs || []).forEach((a) => {
        const d = a.shifts?.shift_date
        if (d) {
          map[d] = {
            id: a.id,
            kind: a.kind,
            status: a.status,
            origin_shop_id: a.origin_shop_id,
            name: a.employees?.first_name || '—',
          }
        }
      })
      setByDate(map)

      const { data: p } = await supabase
        .from('schedule_publications')
        .select('status')
        .eq('shop_id', shopId)
        .eq('month_start', monthStart)
        .maybeSingle()
      setPub(p || null)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Laden mislukt. Probeer opnieuw.' })
    } finally {
      setLoading(false)
    }
  }, [shopId, monthStart, monthEnd])

  useEffect(() => {
    loadPlanning()
  }, [loadPlanning])

  async function doShuffle() {
    if (!shopId) return
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.rpc('shuffle_month', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      const unplaceable = data?.niet_inplanbare_ondernemers || []
      let text = `Ingepland: ${data?.toegewezen ?? 0} · nog leeg: ${data?.nog_leeg ?? 0}`
      if (unplaceable.length) text += ` · ${unplaceable.length} niet inplanbaar (zie rode dagen / conflicten)`
      setMsg({ kind: unplaceable.length ? 'warn' : 'good', text })
      await loadPlanning()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Shuffle mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  function onCellClick(dateStr) {
    if (!openSet.has(dateStr)) return
    const a = byDate[dateStr]
    if (a) {
      setDialog({ kind: 'remove', id: a.id, name: a.name, date: dateStr })
    } else {
      setMsg({ kind: 'good', text: 'Handmatig invullen volgt in de volgende stap — gebruik voorlopig de shuffle.' })
    }
  }

  async function doRemove() {
    const d = dialog
    setDialog(null)
    if (!d?.id) return
    setBusy(true)
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', d.id)
      if (error) throw error
      await loadPlanning()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Verwijderen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doConfirmPlan() {
    setDialog(null)
    setBusy(true)
    try {
      const { error } = await supabase.from('schedule_publications').upsert(
        {
          shop_id: shopId,
          month_start: monthStart,
          status: 'confirmed',
          confirmed_by: employee.id,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: 'shop_id,month_start' },
      )
      if (error) throw error
      setMsg({ kind: 'good', text: 'Planning bevestigd. De admin is verwittigd en kan ze publiceren.' })
      await loadPlanning()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bevestigen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  const minMonth = addMonths(thisMonth, -1)
  const maxMonth = addMonths(thisMonth, 3)
  const canPrev = month > minMonth
  const canNext = month < maxMonth

  const openCount = openSet.size
  const filled = Object.keys(byDate).length
  const empty = Math.max(openCount - filled, 0)

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const blanks = leadingBlanks(month)
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(month.getFullYear(), month.getMonth(), d)
    cells.push({ d, str: ymd(dateObj), isToday: ymd(dateObj) === ymd(today) })
  }

  if (!loading && managedShops.length === 0) {
    return (
      <Shell employee={employee} onLogout={onLogout}>
        <div className="card" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <h2 style={{ marginBottom: 8 }}>Nog geen winkel</h2>
          <p className="muted">Er is nog geen winkel aan jou gekoppeld als shopmanager. Vraag de admin om je toe te wijzen.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell employee={employee} onLogout={onLogout}>
      {managedShops.length > 1 && (
        <div className="pills">
          {managedShops.map((s) => (
            <button
              key={s.id}
              className={'pill' + (s.id === shopId ? ' active' : '')}
              onClick={() => setShopId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {managedShops.length === 1 && (
        <div className="section-title" style={{ marginBottom: 12 }}>
          {managedShops[0].name}
        </div>
      )}

      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>
          ‹
        </button>
        <span className="label">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </span>
        <button className="icon-btn" onClick={() => canNext && setMonth(addMonths(month, 1))} disabled={!canNext}>
          ›
        </button>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>
          Laden…
        </div>
      ) : (
        <>
          {pub?.status === 'confirmed' && <span className="pubbadge confirmed">Bevestigd — wacht op publicatie</span>}
          {pub?.status === 'published' && <span className="pubbadge published">Gepubliceerd</span>}

          <div className="metrics">
            <div className="metric">
              <div className="val">{openCount}</div>
              <div className="lbl">Open dagen</div>
            </div>
            <div className="metric">
              <div className="val">{filled}</div>
              <div className="lbl">Ingepland</div>
            </div>
            <div className="metric">
              <div className="val">{empty}</div>
              <div className="lbl">Leeg</div>
            </div>
          </div>

          <div className="card">
            <div className="weekhead">
              {WEEK.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="pgrid">
              {cells.map((c, i) => {
                if (c === null) return <div key={`b${i}`} className="pcell blank" />
                const open = openSet.has(c.str)
                const a = byDate[c.str]
                let cls = 'pcell'
                if (!open) cls += ' closed'
                else if (!a) cls += ' empty'
                else cls += a.kind === 'mandatory' ? ' ok' : ' paid'
                if (c.isToday) cls += ' today'
                return (
                  <div key={c.str} className={cls} onClick={() => onCellClick(c.str)}>
                    <span className="num">{c.d}</span>
                    {open && <span className="nm">{a ? a.name : 'leeg'}</span>}
                    {a?.origin_shop_id ? (
                      <span className="mark" title={`Verplichte dag van ${shopsMap[a.origin_shop_id] || 'andere winkel'}`}>
                        ↳
                      </span>
                    ) : a?.status === 'manual' ? (
                      <span className="mark" title="Handmatig vastgezet">
                        ●
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="legend">
              <span className="item">
                <span className="sw" style={{ background: 'var(--avail-bg)' }} /> Ondernemer (gratis)
              </span>
              <span className="item">
                <span className="sw" style={{ background: 'var(--paid-bg)' }} /> Betaald (extra/flexi)
              </span>
              <span className="item">
                <span className="sw" style={{ background: 'var(--danger-bg)' }} /> Leeg
              </span>
              <span className="item">
                <span className="sw" style={{ background: 'var(--surface-2)' }} /> Gesloten
              </span>
              <span className="item">↳ van andere winkel</span>
            </div>
          </div>

          <div className="hint">Tik op een ingevulde dag om die toewijzing te verwijderen.</div>

          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 8 }}
            onClick={doShuffle}
            disabled={busy}
          >
            {busy ? 'Bezig…' : 'Shuffle lege dagen'}
          </button>
          <button
            className="btn btn-block"
            style={{ marginTop: 10 }}
            onClick={() => setDialog({ kind: 'confirmplan' })}
            disabled={busy || empty > 0}
            title={empty > 0 ? 'Er zijn nog lege dagen' : ''}
          >
            Planning bevestigen
          </button>
          {empty > 0 && <div className="hint" style={{ textAlign: 'center' }}>Bevestigen kan zodra alle dagen ingevuld zijn.</div>}

          {msg && (
            <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>
          )}
        </>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.kind === 'confirmplan' ? 'Planning bevestigen?' : 'Toewijzing verwijderen?'}
        message={
          dialog?.kind === 'confirmplan'
            ? 'De planning wordt bevestigd en de admin wordt verwittigd om ze te publiceren. Doorgaan?'
            : `Wil je ${dialog?.name || 'deze persoon'} weghalen van ${dialog?.date || 'deze dag'}? De dag wordt dan weer leeg.`
        }
        confirmLabel={dialog?.kind === 'confirmplan' ? 'Ja, bevestigen' : 'Ja, verwijderen'}
        onConfirm={dialog?.kind === 'confirmplan' ? doConfirmPlan : doRemove}
        onCancel={() => setDialog(null)}
      />
    </Shell>
  )
}
