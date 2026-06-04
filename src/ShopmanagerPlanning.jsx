import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
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

export default function ShopmanagerPlanning({ employee, shopId, shopsMap }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [month, setMonth] = useState(addMonths(thisMonth, 1))
  const [openSet, setOpenSet] = useState(new Set())
  const [byDate, setByDate] = useState({})
  const [shiftIdByDate, setShiftIdByDate] = useState({})
  const [pub, setPub] = useState(null)
  const [bonusInfo, setBonusInfo] = useState(null)
  const [subStatus, setSubStatus] = useState([])
  const [buyouts, setBuyouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {kind:'remove',...} | {kind:'publish'}
  const [picker, setPicker] = useState(null) // null | {date, loading, candidates}
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
        .select('id, shift_date')
        .eq('shop_id', shopId)
        .eq('kind', 'standard')
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
      const shiftRows = sh || []
      const dateByShift = {}
      const idByDate = {}
      shiftRows.forEach((s) => {
        dateByShift[s.id] = s.shift_date
        idByDate[s.shift_date] = s.id
      })
      setShiftIdByDate(idByDate)
      setOpenSet(new Set(shiftRows.map((s) => s.shift_date)))

      const map = {}
      const shiftIds = shiftRows.map((s) => s.id)
      if (shiftIds.length) {
        const { data: asgs, error: asgErr } = await supabase
          .from('assignments')
          .select('id, shift_id, employee_id, kind, status, origin_shop_id')
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
          if (d) {
            map[d] = {
              id: a.id,
              kind: a.kind,
              status: a.status,
              origin_shop_id: a.origin_shop_id,
              name: nameById[a.employee_id] || '—',
            }
          }
        })
      }
      setByDate(map)

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
        .select('entrepreneur_id, start_date, end_date, must_operate, employees(first_name, last_name)')
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
          }
        }
      })
      const entList = Object.values(byEnt)
      const entIds = entList.map((e) => e.id)
      const confirmedSet = new Set()
      if (entIds.length) {
        const { data: subs } = await supabase
          .from('availability_submissions')
          .select('employee_id, confirmed_at')
          .in('employee_id', entIds)
          .eq('month_start', monthStart)
        ;(subs || []).forEach((s) => {
          if (s.confirmed_at) confirmedSet.add(s.employee_id)
        })
      }
      const statusList = entList
        .map((e) => ({ name: e.name, status: confirmedSet.has(e.id) ? 'bevestigd' : 'niet' }))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'niet' ? -1 : 1
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

  async function doShuffle() {
    if (!shopId) return
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
    setPicker({ date: dateStr, loading: true, candidates: [] })
    try {
      const { data, error } = await supabase.rpc('candidates_for_slot', { p_shop: shopId, p_day: dateStr })
      if (error) throw error
      setPicker({ date: dateStr, loading: false, candidates: data || [] })
    } catch (e) {
      setPicker({ date: dateStr, loading: false, candidates: [], error: e?.message || String(e) })
    }
  }

  async function performAssign(c, date) {
    const shiftId = shiftIdByDate[date]
    if (!shiftId) return
    setBusy(true)
    try {
      const { error } = await supabase.from('assignments').insert({
        shift_id: shiftId,
        employee_id: c.employee_id,
        kind: c.kind,
        status: 'manual',
        created_by: employee.id,
      })
      if (error) throw error
      await loadPlanning()
      setMsg({ kind: 'good', text: `${c.first_name} ingepland op ${date}.` })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Inplannen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function assignCandidate(c) {
    const date = picker?.date
    if (!shiftIdByDate[date]) return
    setPicker(null)
    if (c.over_max) {
      setDialog({ kind: 'overmax', c, date })
      return
    }
    await performAssign(c, date)
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
            <>
              <div className="hint">De planning voor deze maand is al gepubliceerd. Shuffelen is niet meer mogelijk; manuele aanpassingen kunnen wel — tik op een dag.</div>
            </>
          ) : (
            <>
              <div className="hint">Tik op een lege dag om iemand in te plannen, of op een ingevulde dag om die toewijzing te verwijderen.</div>
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 8, marginBottom: 12 }}
                onClick={doShuffle}
                disabled={busy}
              >
                {busy ? 'Bezig…' : 'Shuffle lege dagen'}
              </button>
            </>
          )}

          {subStatus.length > 0 &&
            (() => {
              const confirmed = subStatus.filter((s) => s.status === 'bevestigd').map((s) => s.name)
              const pending = subStatus.filter((s) => s.status === 'niet').map((s) => s.name)
              return (
                <div className="card">
                  <div className="section-title">
                    Beschikbaarheden ondernemers ({confirmed.length}/{subStatus.length} bevestigd)
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <span className="tag niet">Nog niet doorgegeven ({pending.length})</span>
                    <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
                      {pending.length ? pending.join(', ') : 'Iedereen heeft doorgegeven ✓'}
                    </div>
                  </div>
                  <div>
                    <span className="tag bevestigd">Bevestigd ({confirmed.length})</span>
                    <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
                      {confirmed.length ? confirmed.join(', ') : '—'}
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

          <button
            className="btn btn-block"
            style={{ marginTop: 10 }}
            onClick={() => setDialog({ kind: 'publish' })}
            disabled={busy}
          >
            {pub?.status === 'published' ? 'Update publiceren' : 'Planning publiceren'}
          </button>
          <div className="hint" style={{ textAlign: 'center' }}>
            Publiceren mag ook met lege dagen. Vul je ze later in, dan publiceer je gewoon opnieuw — de betrokkenen
            krijgen dan een update.
          </div>
            </>
          )}

          {msg && (
            <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>
          )}
        </>
      )}

      <ConfirmDialog
        open={dialog !== null}
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

      {picker && (
        <div style={pickerOverlay} onClick={() => setPicker(null)}>
          <div style={pickerDialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>Wie plan je in?</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>{picker.date}</p>
            {picker.loading ? (
              <div className="muted">Laden…</div>
            ) : picker.error ? (
              <p style={{ color: 'var(--danger)', fontSize: 14 }}>Kon de lijst niet laden: {picker.error}</p>
            ) : picker.candidates.length === 0 ? (
              <p className="muted">Niemand gaf deze dag op als beschikbaar voor deze winkel.</p>
            ) : (
              <div>
                {picker.candidates.map((c) => (
                  <button key={c.employee_id + c.kind} style={pickerRow} onClick={() => assignCandidate(c)}>
                    <span style={{ fontWeight: 600 }}>{c.first_name}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span className="muted" style={{ fontSize: 13 }}>{c.label}</span>
                      {c.over_max && (
                        <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>
                          ⚠ max. {c.max_extra} bereikt
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
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
