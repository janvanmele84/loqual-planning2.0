import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog.jsx'
import UnplacedBanner from './UnplacedBanner.jsx'
import InfoFicheDialog from './InfoFicheDialog.jsx'

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
function monthName(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
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

export default function ShopmanagerPlanning({ employee, shopId, shopsMap }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [month, setMonth] = useState(addMonths(thisMonth, 1))
  const [openSet, setOpenSet] = useState(new Set())
  const [byDate, setByDate] = useState({})
  const [byDateExtra, setByDateExtra] = useState({})
  const [shiftIdByDate, setShiftIdByDate] = useState({})
  const [extraShiftIdByDate, setExtraShiftIdByDate] = useState({})
  const [pub, setPub] = useState(null)
  const [bonusInfo, setBonusInfo] = useState(null)
  const [subStatus, setSubStatus] = useState([])
  const [buyouts, setBuyouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {kind:'remove',...} | {kind:'publish'}
  const [picker, setPicker] = useState(null) // null | {date, loading, candidates}
  const [infoFiche, setInfoFiche] = useState(null) // null | employeeId
  const [redis, setRedis] = useState(null) // {incoming, outgoing}
  const [shortOpen, setShortOpen] = useState(false)
  const [shortList, setShortList] = useState(null) // null | array
  const [shortLoading, setShortLoading] = useState(false)
  const [redisDialog, setRedisDialog] = useState(null) // null | {kind:'days',ent,days,loading} | {kind:'pass',ent,reason}

  const monthStart = ymd(firstOfMonth(month))
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))


  const loadPlanning = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
    setMsg(null)
    try {
      const { data: sh } = await supabase
        .from('shifts')
        .select('id, shift_date, kind')
        .eq('shop_id', shopId)
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
      const shiftRows = sh || []
      const stdRows = shiftRows.filter((s) => s.kind === 'standard')
      const extraRows = shiftRows.filter((s) => s.kind === 'extra')
      const dateByShift = {}
      const idByDate = {}
      const extraIdByDate = {}
      stdRows.forEach((s) => {
        dateByShift[s.id] = s.shift_date
        idByDate[s.shift_date] = s.id
      })
      extraRows.forEach((s) => {
        dateByShift[s.id] = s.shift_date
        extraIdByDate[s.shift_date] = s.id
      })
      setShiftIdByDate(idByDate)
      setExtraShiftIdByDate(extraIdByDate)
      setOpenSet(new Set(stdRows.map((s) => s.shift_date)))

      const map = {}
      const extraMap = {}
      const shiftIds = shiftRows.map((s) => s.id)
      if (shiftIds.length) {
        const { data: asgs, error: asgErr } = await supabase
          .from('assignments')
          .select('id, shift_id, employee_id, kind, status, origin_shop_id, makeup_for_month')
          .in('shift_id', shiftIds)
        if (asgErr) throw asgErr
        const empIds = [...new Set((asgs || []).map((a) => a.employee_id))]
        const nameById = {}
        if (empIds.length) {
          const { data: emps } = await supabase.from('employees').select('id, first_name').in('id', empIds)
          ;(emps || []).forEach((e) => (nameById[e.id] = e.first_name))
        }
        ;(asgs || []).forEach((a) => {
          const d = dateByShift[a.shift_id]
          if (!d) return
          const targetMap = extraIdByDate[d] === a.shift_id ? extraMap : map
          targetMap[d] = {
            id: a.id,
            shift_id: a.shift_id,
            kind: a.kind,
            status: a.status,
            origin_shop_id: a.origin_shop_id,
            makeup_for_month: a.makeup_for_month,
            name: nameById[a.employee_id] || '—',
          }
        })
      }
      setByDate(map)
      setByDateExtra(extraMap)

      const { data: p } = await supabase
        .from('schedule_publications')
        .select('status')
        .eq('shop_id', shopId)
        .eq('month_start', monthStart)
        .maybeSingle()
      setPub(p || null)

      const { data: bonusRows } = await supabase.rpc('bonus_for_month', { p_month: monthStart })
      const br = (bonusRows || []).find((r) => r.shop_id === shopId)
      setBonusInfo(br ? { aantal: br.aantal, drempel: br.drempel } : null)

      // Wie moet nog beschikbaarheden doorgeven? (ondernemers met uitbatingsplicht in deze winkel, niet afgekocht)
      const { data: es } = await supabase
        .from('entrepreneur_shops')
        .select('entrepreneur_id, start_date, end_date, must_operate, operate_days, employees(first_name, last_name)')
        .eq('shop_id', shopId)

      const { data: bo } = await supabase
        .from('buyouts')
        .select('entrepreneur_id, employees!inner(first_name, last_name, company_name)')
        .eq('shop_id', shopId)
        .eq('month_start', monthStart)
      const boIds = new Set((bo || []).map((r) => r.entrepreneur_id))
      const boList = (bo || [])
        .map((r) => ({
          id: r.entrepreneur_id,
          name: [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(' ') || 'Onbekend',
          company: r.employees?.company_name || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setBuyouts(boList)

      const activeEnt = (es || []).filter(
        (r) => r.must_operate
          && r.start_date <= monthEnd && (!r.end_date || r.end_date >= monthStart)
          && !boIds.has(r.entrepreneur_id),
      )
      const byEnt = {}
      activeEnt.forEach((r) => {
        if (!byEnt[r.entrepreneur_id]) {
          byEnt[r.entrepreneur_id] = {
            id: r.entrepreneur_id,
            name: [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(' ') || 'Onbekend',
            operate_days: r.operate_days || 1,
          }
        }
      })
      const entList = Object.values(byEnt)
      const entIds = entList.map((e) => e.id)
      const confirmedSet = new Set()
      const buyoutByEmp = new Map()
      if (entIds.length) {
        const { data: subs } = await supabase
          .from('availability_submissions')
          .select('employee_id, confirmed_at')
          .in('employee_id', entIds)
          .eq('month_start', monthStart)
        ;(subs || []).forEach((s) => {
          if (s.confirmed_at) confirmedSet.add(s.employee_id)
        })
        const { data: bs } = await supabase
          .from('buyouts')
          .select('entrepreneur_id, reason, days_count, amount, shift_to_month')
          .in('entrepreneur_id', entIds)
          .eq('shop_id', shopId)
          .eq('month_start', monthStart)
        ;(bs || []).forEach((b) => buyoutByEmp.set(b.entrepreneur_id, b))
      }
      const statusList = entList
        .map((e) => {
          const b = buyoutByEmp.get(e.id) || null
          const status = b
            ? 'afgehandeld'
            : confirmedSet.has(e.id)
              ? 'bevestigd'
              : 'niet'
          return { id: e.id, name: e.name, operate_days: e.operate_days, status, buyout: b }
        })
        .sort((a, b) => {
          // Volgorde: niet → afgehandeld → bevestigd
          const order = { niet: 0, afgehandeld: 1, bevestigd: 2 }
          if (a.status !== b.status) return order[a.status] - order[b.status]
          return a.name.localeCompare(b.name)
        })
      setSubStatus(statusList)

      const { data: rsum } = await supabase.rpc('redistribution_summary', { p_shop: shopId, p_month: monthStart })
      const rs = Array.isArray(rsum) ? rsum[0] : rsum
      setRedis(rs ? { incoming: rs.incoming || 0, outgoing: rs.outgoing || 0 } : { incoming: 0, outgoing: 0 })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Laden mislukt. Probeer opnieuw.' })
    } finally {
      setLoading(false)
    }
  }, [shopId, monthStart, monthEnd])

  useEffect(() => {
    loadPlanning()
  }, [loadPlanning])

  useEffect(() => {
    setShortOpen(false)
    setShortList(null)
  }, [monthStart, shopId])

  async function applyHandle(reason, shiftToMonth, daysCount) {
    const { employeeId, name } = dialog
    setDialog(null)
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.rpc('mark_entrepreneur_handled', {
        p_employee_id: employeeId,
        p_shop_id: shopId,
        p_month: monthStart,
        p_reason: reason,
        p_shift_to_month: shiftToMonth || null,
        p_days_count: daysCount ?? null,
      })
      if (error) throw error
      await load()
      const tail =
        reason === 'paid' ? `gemarkeerd als afgekocht${daysCount ? ` (${daysCount} ${daysCount === 1 ? 'dag' : 'dagen'})` : ''}` :
        reason === 'shifted' ? `verschoven naar ${monthName(shiftToMonth)}` :
        'afgehandeld'
      setMsg({ kind: 'good', text: `${name} ${tail}.` })
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Afhandelen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmOnBehalf() {
    const { employeeId, name } = dialog
    setDialog(null)
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.rpc('confirm_submission_on_behalf', {
        p_employee_id: employeeId,
        p_month: monthStart,
      })
      if (error) throw error
      await load()
      setMsg({ kind: 'good', text: `${name} is bevestigd namens hem.` })
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Bevestigen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  function markHandled(employeeId, name, operate_days) {
    setDialog({ kind: 'handle', employeeId, name, operate_days: operate_days || 1 })
  }

  async function undoHandled(employeeId, name) {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase
        .from('buyouts')
        .delete()
        .eq('entrepreneur_id', employeeId)
        .eq('shop_id', shopId)
        .eq('month_start', monthStart)
      if (error) throw error
      await load()
      setMsg({ kind: 'good', text: `Afhandeling van ${name} ongedaan gemaakt.` })
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Ongedaan maken mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doShuffle() {    if (!shopId) return
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.rpc('shuffle_month', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      await loadPlanning()
      const unplaceable = data?.niet_inplanbare_ondernemers || []
      let text = `Ingepland: ${data?.toegewezen ?? 0} · nog leeg: ${data?.nog_leeg ?? 0}`
      if (unplaceable.length) text += ` · ${unplaceable.length} niet inplanbaar (zie rode dagen)`
      setMsg({ kind: 'good', text })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Shuffle mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function onExtraCellClick(dateStr) {
    if (dateStr < ymd(today)) {
      setMsg({ kind: 'err', text: 'Dagen in het verleden kun je niet meer wijzigen.' })
      return
    }
    const ax = byDateExtra[dateStr]
    if (ax) {
      setDialog({ kind: 'remove', id: ax.id, name: ax.name, date: dateStr, isExtra: true })
      return
    }
    setMsg(null)
    await loadCandidates(dateStr, false, true)
  }

  async function onCellClick(dateStr) {
    if (!openSet.has(dateStr)) return
    if (dateStr < ymd(today)) {
      setMsg({ kind: 'err', text: 'Dagen in het verleden kun je niet meer wijzigen.' })
      return
    }
    const a = byDate[dateStr]
    if (a) {
      setDialog({ kind: 'remove', id: a.id, name: a.name, date: dateStr })
      return
    }
    setMsg(null)
    setPicker({ date: dateStr, loading: true, candidates: [], includeAll: false })
    await loadCandidates(dateStr, false, false)
  }

  async function loadCandidates(dateStr, includeAll, isExtra) {
    setPicker((prev) => ({ ...(prev || {}), date: dateStr, isExtra, includeAll, loading: true, candidates: prev?.candidates || [] }))
    try {
      const { data, error } = await supabase.rpc('candidates_for_slot', {
        p_shop: shopId, p_day: dateStr, p_include_all: includeAll,
      })
      if (error) throw error
      setPicker({ date: dateStr, isExtra, includeAll, loading: false, candidates: data || [] })
    } catch (e) {
      setPicker({ date: dateStr, isExtra, includeAll, loading: false, candidates: [], error: e?.message || String(e) })
    }
  }

  async function performAssign(c, date, isExtra = false) {
    const shiftId = isExtra ? extraShiftIdByDate[date] : shiftIdByDate[date]
    if (!shiftId) return
    setBusy(true)
    try {
      const { error } = await supabase.from('assignments').insert({
        shift_id: shiftId,
        employee_id: c.employee_id,
        kind: isExtra ? 'extra' : c.kind,
        status: 'manual',
        created_by: employee.id,
      })
      if (error) throw error
      await loadPlanning()
      setMsg({ kind: 'good', text: `${c.first_name} ingepland op ${date}${isExtra ? ' (extra shift)' : ''}.` })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Inplannen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function assignCandidate(c) {
    const date = picker?.date
    const isExtra = !!picker?.isExtra
    const targetId = isExtra ? extraShiftIdByDate[date] : shiftIdByDate[date]
    if (!targetId) return
    setPicker(null)
    if (c.over_max && !isExtra) {
      setDialog({ kind: 'overmax', c, date, isExtra })
      return
    }
    await performAssign(c, date, isExtra)
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

  async function doPublish() {
    setDialog(null)
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase.from('schedule_publications').upsert(
        {
          shop_id: shopId,
          month_start: monthStart,
          status: 'published',
          confirmed_by: employee.id,
          confirmed_at: now,
          published_at: now,
        },
        { onConflict: 'shop_id,month_start' },
      )
      if (error) throw error
      setMsg({ kind: 'good', text: 'Planning gepubliceerd. De ingeplande medewerkers worden verwittigd.' })
      // Onmiddellijke aflevering: de verzendmotor wakker schudden. Fire-and-forget;
      // de cron pakt het anders sowieso op binnen enkele minuten.
      supabase.functions.invoke('send-emails').catch(() => {})
      await loadPlanning()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Publiceren mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function loadShortfall() {
    setShortLoading(true)
    try {
      const { data, error } = await supabase.rpc('shortfall_list', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      setShortList(data || [])
    } catch (e) {
      setShortList([])
      setMsg({ kind: 'err', text: 'Lijst laden mislukt.' })
    } finally {
      setShortLoading(false)
    }
  }

  function toggleShortfall() {
    const next = !shortOpen
    setShortOpen(next)
    if (next && shortList === null) loadShortfall()
  }

  async function openDays(ent) {
    setRedisDialog({ kind: 'days', ent, days: [], loading: true })
    try {
      const { data, error } = await supabase.rpc('redistribution_days', {
        p_shop: shopId, p_month: monthStart, p_entrepreneur: ent.entrepreneur_id,
      })
      if (error) throw error
      setRedisDialog({ kind: 'days', ent, days: (data || []).map((r) => r.day), loading: false })
    } catch (e) {
      setRedisDialog({ kind: 'days', ent, days: [], loading: false, error: e?.message || String(e) })
    }
  }

  async function doAssignRedis(ent, day) {
    setRedisDialog(null)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('assign_redistributed', {
        p_shop: shopId, p_day: day, p_entrepreneur: ent.entrepreneur_id,
      })
      if (error) throw error
      await loadPlanning()
      await loadShortfall()
      setMsg({ kind: 'good', text: `${ent.first_name} overgenomen op ${day}, gecrediteerd aan ${ent.home_shops || 'thuiswinkel'}.` })
    } catch (e) {
      setMsg({ kind: 'err', text: e?.message || 'Overnemen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doPass() {
    const d = redisDialog
    if (!d || d.kind !== 'pass') return
    setRedisDialog(null)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('pass_redistribution', {
        p_shop: shopId, p_entrepreneur: d.ent.entrepreneur_id, p_month: monthStart, p_reason: d.reason || '',
      })
      if (error) throw error
      await loadShortfall()
      setMsg({ kind: 'good', text: `${d.ent.first_name} overgeslagen voor deze maand.` })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Overslaan mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  const minMonth = addMonths(thisMonth, -4)
  const maxMonth = addMonths(thisMonth, 6)
  const canPrev = month > minMonth
  const canNext = month < maxMonth
  const monthIsPast = month < thisMonth
  const todayStr = ymd(today)

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

  return (
    <>
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
        <UnplacedBanner shopId={shopId} monthStart={monthStart} />
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

          {bonusInfo && (
            <div className="hint" style={{ textAlign: 'center', marginTop: -6, marginBottom: 14 }}>
              Bonus-indicatie: {bonusInfo.aantal} uitbatende/afkopende ondernemers · drempel {bonusInfo.drempel} (gemiddelde openingsdagen)
            </div>
          )}

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
                const ax = byDateExtra[c.str]
                const hasExtra = !!extraShiftIdByDate[c.str]
                const past = c.str < todayStr
                let cls = 'pcell'
                if (!open) cls += ' closed'
                else if (!a) cls += ' empty'
                else cls += a.kind === 'mandatory' ? ' ok' : ' paid'
                if (c.isToday) cls += ' today'
                return (
                  <div
                    key={c.str}
                    className={cls}
                    style={past ? { opacity: 0.5, cursor: 'default' } : undefined}
                    onClick={() => onCellClick(c.str)}
                  >
                    <span className="num">{c.d}</span>
                    {open && <span className="nm">{a ? a.name : 'leeg'}</span>}
                    {hasExtra && (
                      <span
                        className="mark"
                        title={ax ? `Extra shift: ${ax.name}` : 'Extra shift — klik om iemand toe te voegen'}
                        style={{ position: 'absolute', top: 2, right: 18, fontSize: 11, background: '#cce5ff', color: '#003a75', padding: '0 4px', borderRadius: 4, cursor: 'pointer' }}
                        onClick={(ev) => { ev.stopPropagation(); onExtraCellClick(c.str) }}
                      >
                        {ax ? `+ ${ax.name}` : '+'}
                      </span>
                    )}
                    {a?.makeup_for_month ? (
                      <span className="mark" title={`Inhaaldag voor ${monthName(a.makeup_for_month)}`}>
                        ⏪
                      </span>
                    ) : a?.origin_shop_id ? (
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
                <span className="sw" style={{ background: 'var(--avail-bg)' }} /> Ondernemer (verplichte dag)
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

          {monthIsPast ? (
            <div className="hint">Deze maand is voorbij — alleen-lezen. Je ziet hier wie wanneer werkte; wijzigen kan niet meer.</div>
          ) : pub?.status === 'published' ? (
            <div className="hint">De planning voor deze maand is gepubliceerd. Manuele aanpassingen kunnen nog — tik op een dag.</div>
          ) : (
            <div className="hint">Tik op een lege dag om iemand in te plannen, of op een ingevulde dag om die toewijzing te verwijderen. Het systeem doet zelf een shuffle op de bevestigingsdeadline (15de van de tweede maand vooraf) en publiceert automatisch op de 1ste van de voorgaande maand.</div>
          )}

          {subStatus.length > 0 &&
            (() => {
              const confirmed = subStatus.filter((s) => s.status === 'bevestigd')
              const handled = subStatus.filter((s) => s.status === 'afgehandeld')
              const pending = subStatus.filter((s) => s.status === 'niet')
              return (
                <div className="card">
                  <div className="section-title">
                    Beschikbaarheden ondernemers ({confirmed.length}/{subStatus.length} bevestigd)
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <span className="tag niet">Nog niet doorgegeven ({pending.length})</span>
                    {pending.length === 0 ? (
                      <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>Iedereen is doorgegeven of afgehandeld ✓</div>
                    ) : (
                      <div style={{ marginTop: 6 }}>
                        {pending.map((p) => (
                          <div className="row-item" key={p.id}>
                            <button
                              type="button"
                              onClick={() => setInfoFiche(p.id)}
                              style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit', textAlign: 'left' }}
                              title="Toon infofiche"
                            >
                              {p.name}
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              disabled={busy}
                              onClick={() => markHandled(p.id, p.name, p.operate_days)}
                              title="Markeer als afgehandeld — bv. dag verschoven naar volgende maand of zelf ingevuld"
                            >
                              Afhandelen
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {handled.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span className="tag" style={{ background: '#fff2dd', color: '#8a571f' }}>
                        Afgehandeld ({handled.length})
                      </span>
                      <div style={{ marginTop: 6 }}>
                        {handled.map((p) => {
                          const b = p.buyout
                          const days = b?.days_count || p.operate_days
                          const reasonText =
                            b?.reason === 'paid' ? `${days}/${p.operate_days} ${days === 1 ? 'dag' : 'dagen'} afgekocht (€${200 * days})` :
                            b?.reason === 'auto_unconfirmed' ? `automatisch afgekocht (€${200 * days})` :
                            b?.reason === 'shifted' ? `verschoven naar ${monthName(b.shift_to_month)}` :
                            'andere afhandeling'
                          return (
                            <div className="row-item" key={p.id}>
                              <span style={{ minWidth: 0 }}>
                                <button
                                  type="button"
                                  onClick={() => setInfoFiche(p.id)}
                                  style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit', textAlign: 'left' }}
                                  title="Toon infofiche"
                                >
                                  {p.name}
                                </button>
                                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                  {reasonText}
                                </div>
                              </span>
                              <button
                                className="btn"
                                style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }}
                                disabled={busy}
                                onClick={() => undoHandled(p.id, p.name)}
                                title="Verwijder de afkoop / verschuiving voor deze maand in deze winkel"
                              >
                                Ongedaan
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="tag bevestigd">Bevestigd ({confirmed.length})</span>
                    <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
                      {confirmed.length === 0 ? '—' : confirmed.map((c, i) => (
                        <span key={c.id}>
                          <button
                            type="button"
                            onClick={() => setInfoFiche(c.id)}
                            style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
                            title="Toon infofiche"
                          >
                            {c.name}
                          </button>
                          {i < confirmed.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}

          {buyouts.length > 0 && (
            <div className="card">
              <div className="section-title">Afkopen deze maand ({buyouts.length})</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Deze ondernemers hebben hun uitbatingsdag in deze winkel afgekocht. Ze tellen niet mee voor de verplichte invulling, en ze komen niet in de planning.
              </div>
              {buyouts.map((b) => (
                <div className="row-item" key={b.id}>
                  <span>
                    {b.name}
                    {b.company ? <span className="muted" style={{ marginLeft: 6 }}>· {b.company}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!monthIsPast && (
            <>
          <div className="card">
            <div className="section-title">Ondernemers die nog een dag zoeken</div>
            <div className="hint" style={{ marginTop: 0 }}>
              Ondernemers uit andere (gepubliceerde) winkels die hun uitbatingsdag daar niet kwijt kunnen. Je kunt ze
              hier overnemen — de dag telt dan voor hún winkel.
            </div>
            {!shortOpen ? (
              <button className="btn btn-block" onClick={toggleShortfall} disabled={busy}>
                Lijst tonen
              </button>
            ) : shortLoading ? (
              <div className="muted">Laden…</div>
            ) : (shortList || []).length === 0 ? (
              <div className="muted">Niemand zoekt momenteel nog een dag (of de andere winkels zijn nog niet gepubliceerd).</div>
            ) : (
              <div>
                {shortList.map((s) => (
                  <div key={s.entrepreneur_id} style={redisRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {s.first_name}
                        {s.company_name ? <span className="muted" style={{ fontWeight: 400 }}> · {s.company_name}</span> : null}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {s.home_shops || 'andere winkel'} · {s.shortfall} {s.shortfall === 1 ? 'dag' : 'dagen'} tekort
                        {' · '}
                        {s.your_match > 0 ? `jij kunt ${s.your_match} ${s.your_match === 1 ? 'dag' : 'dagen'}` : 'geen passende dag bij jou'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '7px 12px', fontSize: 14 }}
                        onClick={() => openDays(s)}
                        disabled={busy || s.your_match === 0}
                      >
                        Inplannen
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '7px 12px', fontSize: 14 }}
                        onClick={() => setRedisDialog({ kind: 'pass', ent: s, reason: '' })}
                        disabled={busy}
                      >
                        Overslaan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {redis && (redis.incoming > 0 || redis.outgoing > 0) && (
              <div className="hint" style={{ marginBottom: 0, marginTop: 12 }}>
                Deze maand: {redis.incoming} {redis.incoming === 1 ? 'dag' : 'dagen'} overgenomen van andere winkels ·{' '}
                {redis.outgoing} van jouw ondernemers {redis.outgoing === 1 ? 'baat' : 'baten'} elders uit.
              </div>
            )}
          </div>

          {!monthIsPast && pub?.status !== 'published' && (
            <div className="hint" style={{ marginTop: 10, textAlign: 'center', padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
              De planning wordt automatisch gepubliceerd op de 1ste van de voorgaande maand. Tot dan kun je nog vrij aanpassen.
            </div>
          )}
            </>
          )}

          {msg && (
            <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>
          )}
        </>
      )}

      <ConfirmDialog
        open={['publish', 'overmax', 'remove'].includes(dialog?.kind)}
        title={
          dialog?.kind === 'publish'
            ? 'Planning publiceren?'
            : dialog?.kind === 'overmax'
            ? 'Boven het gewenste maximum'
            : 'Toewijzing verwijderen?'
        }
        message={
          dialog?.kind === 'publish'
            ? empty > 0
              ? `Er zijn nog ${empty} lege ${empty === 1 ? 'dag' : 'dagen'}. Die blijven open tot je ze invult en opnieuw publiceert. De ingeplande medewerkers worden verwittigd. Toch publiceren?`
              : 'De planning wordt gepubliceerd en de ingeplande medewerkers worden verwittigd. Doorgaan?'
            : dialog?.kind === 'overmax'
            ? `${dialog.c.first_name} gaf aan deze maand maximaal ${dialog.c.max_extra} ${dialog.c.max_extra === 1 ? 'dag' : 'dagen'} ${dialog.c.kind === 'extra' ? 'extra uit te baten' : 'te werken'}, en zit daar al aan. Ben je zeker dat je ${dialog.c.first_name} toch wil inplannen op ${dialog.date}?`
            : `Wil je ${dialog?.name || 'deze persoon'} weghalen van ${dialog?.date || 'deze dag'}? De dag wordt dan weer leeg.`
        }
        confirmLabel={
          dialog?.kind === 'publish'
            ? 'Ja, publiceren'
            : dialog?.kind === 'overmax'
            ? 'Ja, toch inplannen'
            : 'Ja, verwijderen'
        }
        onConfirm={
          dialog?.kind === 'publish'
            ? doPublish
            : dialog?.kind === 'overmax'
            ? () => { const d = dialog; setDialog(null); performAssign(d.c, d.date) }
            : doRemove
        }
        onCancel={() => setDialog(null)}
      />

      {dialog?.kind === 'handle' && (() => {
        const cur = new Date(monthStart)
        const prev = new Date(cur.getFullYear(), cur.getMonth() - 1, 1)
        const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
        const appStart = new Date('2026-07-01')
        const prevAllowed = prev >= appStart
        const od = dialog.operate_days || 1
        const partialOptions = []
        for (let i = 1; i < od; i++) partialOptions.push(i)
        return (
          <div style={pickerOverlay} onClick={() => setDialog(null)}>
            <div style={pickerDialog} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: 6 }}>Afhandelen: {dialog.name}</h3>
              <div className="muted" style={{ marginBottom: 14, fontSize: 14 }}>
                Voor {monthName(monthStart)} — kies hoe je deze ondernemer wil afhandelen.
                {od > 1 && ` Deze ondernemer heeft ${od} uitbatingsdagen in deze winkel.`}
              </div>
              <button className="btn btn-block" style={{ marginBottom: 8 }} disabled={busy}
                onClick={() => applyHandle('paid', null, null)}>
                Afgekocht — alle {od > 1 ? `${od} dagen` : '1 dag'} (€{200 * od})
              </button>
              {partialOptions.map((n) => (
                <button key={n} className="btn btn-block" style={{ marginBottom: 8 }} disabled={busy}
                  onClick={() => applyHandle('paid', null, n)}>
                  Gedeeltelijk afgekocht — {n} van {od} {n === 1 ? 'dag' : 'dagen'} (€{200 * n}, rest moet nog uitbaten)
                </button>
              ))}
              {prevAllowed && (
                <button className="btn btn-block" style={{ marginBottom: 8 }} disabled={busy}
                  onClick={() => applyHandle('shifted', ymd(prev), null)}>
                  Verschuiven naar {MONTHS[prev.getMonth()]} (vorige maand)
                </button>
              )}
              <button className="btn btn-block" style={{ marginBottom: 8 }} disabled={busy}
                onClick={() => applyHandle('shifted', ymd(next), null)}>
                Verschuiven naar {MONTHS[next.getMonth()]} (volgende maand)
              </button>
              <button className="btn btn-block" style={{ marginBottom: 8 }} disabled={busy}
                onClick={() => applyHandle('other', null, null)}>
                Andere afhandeling (manager regelt zelf)
              </button>
              <button className="btn btn-block" style={{ marginBottom: 8, background: '#e8efe4', color: '#2f5a31' }} disabled={busy}
                onClick={confirmOnBehalf}>
                Akkoord — bevestig namens hem (telt als doorgegeven)
              </button>
              <button className="btn btn-block" disabled={busy} onClick={() => setDialog(null)}>
                Annuleren
              </button>
            </div>
          </div>
        )
      })()}

      {picker && (
        <div style={pickerOverlay} onClick={() => setPicker(null)}>
          <div style={pickerDialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>{picker.isExtra ? 'Wie plan je in op de extra shift?' : 'Wie plan je in?'}</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>{picker.date}{picker.isExtra ? ' · extra shift' : ''}</p>
            {picker.loading ? (
              <div className="muted">Laden…</div>
            ) : picker.error ? (
              <p style={{ color: 'var(--danger)', fontSize: 14 }}>Kon de lijst niet laden: {picker.error}</p>
            ) : picker.candidates.length === 0 ? (
              <p className="muted">Niemand gaf deze dag op als beschikbaar voor deze winkel.</p>
            ) : (
              <div>
                {picker.candidates.map((c) => {
                  const hasQuota = c.quota_total != null && c.quota_total > 0
                  const allDone = hasQuota && c.quota_open === 0
                  const isFallback = !!c.is_fallback
                  const isTakeover = !!c.is_takeover
                  let effectiveLabel = c.label
                  if (isFallback) {
                    effectiveLabel = 'Niet doorgegeven — manueel'
                  } else if (isTakeover) {
                    effectiveLabel = `Overname — geen plaats in ${c.home_shops || 'eigen winkel'}`
                  } else if (c.kind === 'mandatory' && allDone) {
                    effectiveLabel = 'Extra dag (alle verplichte al ingepland)'
                  } else if (c.kind === 'mandatory' && hasQuota && c.quota_open < c.quota_total) {
                    effectiveLabel = `Verplichte dag (${c.quota_open} van ${c.quota_total} open)`
                  }
                  const shopsText = c.assigned_shops || ''
                  const rowStyle = isFallback
                    ? { ...pickerRow, opacity: 0.65, fontStyle: 'italic' }
                    : isTakeover
                      ? { ...pickerRow, background: '#fff7e8', borderColor: '#d88' }
                      : pickerRow
                  return (
                    <button key={c.employee_id + c.kind} style={rowStyle} onClick={() => assignCandidate(c)}>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>
                          {c.first_name}
                          {isTakeover && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#fde2c8', color: '#8a571f', verticalAlign: 'middle' }}>overname</span>}
                        </span>
                        {shopsText && (
                          <span style={{ fontSize: 11.5, color: 'var(--muted, #777)' }}>reeds ingepland: {shopsText}</span>
                        )}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span className="muted" style={{ fontSize: 13, color: allDone ? '#1565c0' : isFallback ? '#8a571f' : isTakeover ? '#8a571f' : undefined }}>{effectiveLabel}</span>
                        {c.over_max && (
                          <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>
                            ⚠ max. {c.max_extra} bereikt
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn"
                style={{ fontSize: 12 }}
                onClick={() => loadCandidates(picker.date, !picker.includeAll, !!picker.isExtra)}
              >
                {picker.includeAll ? 'Verberg niet-beschikbaren' : 'Toon ook niet-beschikbaren'}
              </button>
              <button className="btn" onClick={() => setPicker(null)}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      {redisDialog && (
        <div style={pickerOverlay} onClick={() => setRedisDialog(null)}>
          <div style={pickerDialog} onClick={(e) => e.stopPropagation()}>
            {redisDialog.kind === 'days' ? (
              <>
                <h3 style={{ marginBottom: 4 }}>{redisDialog.ent.first_name} inplannen</h3>
                <p className="muted" style={{ margin: '0 0 14px' }}>Kies een dag in jouw winkel.</p>
                {redisDialog.loading ? (
                  <div className="muted">Laden…</div>
                ) : redisDialog.error ? (
                  <p style={{ color: 'var(--danger)', fontSize: 14 }}>Kon de dagen niet laden: {redisDialog.error}</p>
                ) : redisDialog.days.length === 0 ? (
                  <p className="muted">Geen passende vrije dag gevonden.</p>
                ) : (
                  <div>
                    {redisDialog.days.map((d) => (
                      <button key={d} style={pickerRow} onClick={() => doAssignRedis(redisDialog.ent, d)}>
                        <span style={{ fontWeight: 600 }}>{d}</span>
                        <span className="muted" style={{ fontSize: 13 }}>kiezen</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn" onClick={() => setRedisDialog(null)}>Sluiten</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginBottom: 4 }}>{redisDialog.ent.first_name} overslaan</h3>
                <p className="muted" style={{ margin: '0 0 12px' }}>
                  Deze ondernemer verdwijnt uit jouw lijst voor deze maand. Een korte reden helpt zijn winkel verder.
                </p>
                <input
                  className="input fw"
                  placeholder="Reden (bv. dag komt niet uit, wil hier niet staan…)"
                  value={redisDialog.reason}
                  onChange={(e) => setRedisDialog({ ...redisDialog, reason: e.target.value })}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button className="btn" onClick={() => setRedisDialog(null)}>Annuleren</button>
                  <button className="btn btn-primary" onClick={doPass} disabled={busy}>Overslaan</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {infoFiche && (
        <InfoFicheDialog
          employeeId={infoFiche}
          monthStart={monthStart}
          onClose={() => setInfoFiche(null)}
        />
      )}
    </>
  )
}

const pickerOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(42, 37, 33, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 50,
}
const pickerDialog = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 16,
  padding: '22px',
  maxWidth: 380,
  width: '100%',
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
}
const pickerRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: '11px 4px',
  border: 'none',
  borderBottom: '1px solid var(--line)',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 15,
  color: 'var(--ink)',
  textAlign: 'left',
}
const redisRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 0',
  borderBottom: '1px solid var(--line)',
}
