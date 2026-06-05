import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell.jsx'
import MyDeadlineBanner from './MyDeadlineBanner.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import TeamCalendar from './TeamCalendar.jsx'

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

export default function WorkerCalendar({ employee, onLogout }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [month, setMonth] = useState(thisMonth)
  const [view, setView] = useState('mine') // 'mine' | 'team'
  const [shops, setShops] = useState([])
  const [prefShops, setPrefShops] = useState([])
  const [lockedShops, setLockedShops] = useState(new Set())
  const [openSet, setOpenSet] = useState(new Set())
  const [days, setDays] = useState(new Set())
  const [lockedDays, setLockedDays] = useState(new Set())
  const [maxDays, setMaxDays] = useState(0)
  const [lockedMaxDays, setLockedMaxDays] = useState(0)
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | 'confirm' | 'extra'
  const [released, setReleased] = useState(true)

  const monthStart = ymd(firstOfMonth(month))
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const locked = !!submission?.confirmed_at

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      // Welke winkels gaven deze maand vrij?
      const { data: rel } = await supabase
        .from('shop_availability_release')
        .select('shop_id')
        .eq('month_start', monthStart)
      const releasedIds = new Set((rel || []).map((r) => r.shop_id))
      setReleased(releasedIds.size > 0)

      const { data: shopRows } = await supabase
        .from('shops')
        .select('id, name')
        .eq('active', true)
        .order('name')
      const shopList = (shopRows || []).filter((s) => releasedIds.has(s.id))
      setShops(shopList)
      const shopIds = shopList.map((s) => s.id)

      let openDays = new Set()
      if (shopIds.length) {
        const { data: shifts } = await supabase
          .from('shifts')
          .select('shift_date')
          .in('shop_id', shopIds)
          .eq('kind', 'standard')
          .gte('shift_date', monthStart)
          .lte('shift_date', monthEnd)
        openDays = new Set((shifts || []).map((s) => s.shift_date))
      }
      setOpenSet(openDays)

      const { data: sub } = await supabase
        .from('availability_submissions')
        .select('id, confirmed_at, max_extra_days')
        .eq('employee_id', employee.id)
        .eq('month_start', monthStart)
        .maybeSingle()
      setSubmission(sub || null)
      setMaxDays(sub?.max_extra_days ?? 0)

      let dd = new Set()
      let prefs = []
      if (sub) {
        const { data: ad } = await supabase
          .from('availability_days')
          .select('day')
          .eq('submission_id', sub.id)
          .eq('kind', 'work')
        dd = new Set((ad || []).map((r) => r.day))
        const { data: pr } = await supabase
          .from('availability_shop_prefs')
          .select('shop_id, rank')
          .eq('submission_id', sub.id)
          .order('rank')
        prefs = (pr || []).map((r) => r.shop_id)
      }
      setDays(dd)
      setLockedDays(sub?.confirmed_at ? new Set(dd) : new Set())
      setPrefShops(prefs)
      setLockedShops(sub?.confirmed_at ? new Set(prefs) : new Set())
      setLockedMaxDays(sub?.confirmed_at ? (sub?.max_extra_days ?? 0) : 0)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Laden mislukt. Probeer opnieuw.' })
    } finally {
      setLoading(false)
    }
  }, [employee.id, monthStart, monthEnd])

  useEffect(() => {
    load()
  }, [load])

  async function ensureSubmission() {
    if (submission) return submission
    const { data, error } = await supabase
      .from('availability_submissions')
      .upsert(
        { employee_id: employee.id, month_start: monthStart, max_extra_days: Number(maxDays) || 0 },
        { onConflict: 'employee_id,month_start' },
      )
      .select('id, confirmed_at, max_extra_days')
      .single()
    if (error) throw error
    setSubmission(data)
    return data
  }

  async function toggleDay(dateStr) {
    if (!openSet.has(dateStr)) return
    const has = days.has(dateStr)

    if (locked) {
      if (has && lockedDays.has(dateStr)) {
        setMsg({ kind: 'err', text: 'Deze dag is bevestigd en kan niet meer verwijderd worden.' })
        return
      }
      setDays((prev) => {
        const n = new Set(prev)
        has ? n.delete(dateStr) : n.add(dateStr)
        return n
      })
      setMsg(null)
      return
    }

    setDays((prev) => {
      const n = new Set(prev)
      has ? n.delete(dateStr) : n.add(dateStr)
      return n
    })
    setMsg(null)
    try {
      const sub = await ensureSubmission()
      if (has) {
        await supabase
          .from('availability_days')
          .delete()
          .eq('submission_id', sub.id)
          .eq('kind', 'work')
          .eq('day', dateStr)
      } else {
        await supabase.from('availability_days').insert({ submission_id: sub.id, day: dateStr, kind: 'work' })
      }
    } catch (e) {
      setDays((prev) => {
        const n = new Set(prev)
        has ? n.add(dateStr) : n.delete(dateStr)
        return n
      })
      setMsg({ kind: 'err', text: 'Opslaan mislukt — probeer opnieuw.' })
    }
  }

  async function persistPrefs(order, subId) {
    await supabase.from('availability_shop_prefs').delete().eq('submission_id', subId)
    if (order.length) {
      await supabase
        .from('availability_shop_prefs')
        .insert(order.map((shopId, i) => ({ submission_id: subId, shop_id: shopId, rank: i + 1 })))
    }
  }

  async function toggleShop(shopId) {
    if (locked) {
      if (lockedShops.has(shopId)) {
        setMsg({ kind: 'err', text: 'Deze winkel is bevestigd en kan niet meer worden uitgevinkt.' })
        return
      }
      // nieuwe winkel: in het geheugen aan/uit tot je ze toevoegt
      setPrefShops((prev) => (prev.includes(shopId) ? prev.filter((id) => id !== shopId) : [...prev, shopId]))
      setMsg(null)
      return
    }
    const order = prefShops.includes(shopId)
      ? prefShops.filter((id) => id !== shopId)
      : [...prefShops, shopId]
    setPrefShops(order)
    setMsg(null)
    try {
      const sub = await ensureSubmission()
      await persistPrefs(order, sub.id)
    } catch (e) {
      setPrefShops(prefShops)
      setMsg({ kind: 'err', text: 'Winkelvoorkeur opslaan mislukt.' })
    }
  }

  function onMaxBlur() {
    if (locked) {
      if ((Number(maxDays) || 0) < lockedMaxDays) setMaxDays(lockedMaxDays)
      return
    }
    saveMaxDays()
  }

  async function saveMaxDays() {
    if (locked) return
    try {
      const sub = await ensureSubmission()
      await supabase
        .from('availability_submissions')
        .update({ max_extra_days: Number(maxDays) || 0 })
        .eq('id', sub.id)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Opslaan mislukt.' })
    }
  }

  function askConfirm() {
    if (prefShops.length === 0) {
      setMsg({ kind: 'err', text: 'Kies minstens één winkel waar je wil werken.' })
      return
    }
    if (days.size === 0) {
      setMsg({ kind: 'err', text: 'Duid minstens één dag aan.' })
      return
    }
    setDialog('confirm')
  }

  async function doConfirm() {
    setDialog(null)
    setBusy(true)
    try {
      const sub = await ensureSubmission()
      await saveMaxDays()
      const { data, error } = await supabase
        .from('availability_submissions')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', sub.id)
        .select('id, confirmed_at, max_extra_days')
        .single()
      if (error) throw error
      setSubmission(data)
      setLockedDays(new Set(days))
      setLockedShops(new Set(prefShops))
      setLockedMaxDays(Number(maxDays) || 0)
      setMsg({ kind: 'good', text: 'Bevestigd. Je kunt nog extra dagen, winkels en werkdagen toevoegen, maar niets verwijderen.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bevestigen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doAddExtra() {
    setDialog(null)
    const pendingDays = [...days].filter((d) => !lockedDays.has(d))
    const pendingShops = prefShops.filter((id) => !lockedShops.has(id))
    const maxRaised = (Number(maxDays) || 0) > lockedMaxDays
    if (!pendingDays.length && !pendingShops.length && !maxRaised) return
    setBusy(true)
    try {
      const sub = await ensureSubmission()
      if (pendingDays.length) {
        const { error } = await supabase
          .from('availability_days')
          .insert(pendingDays.map((d) => ({ submission_id: sub.id, day: d, kind: 'work' })))
        if (error) throw error
      }
      if (pendingShops.length) {
        const base = lockedShops.size
        const { error } = await supabase
          .from('availability_shop_prefs')
          .insert(pendingShops.map((shopId, i) => ({ submission_id: sub.id, shop_id: shopId, rank: base + i + 1 })))
        if (error) throw error
      }
      if (maxRaised) {
        const { error } = await supabase.rpc('increase_max_extra_days', { p_submission: sub.id, p_value: Number(maxDays) || 0 })
        if (error) throw error
      }
      setLockedDays((prev) => new Set([...prev, ...pendingDays]))
      setLockedShops((prev) => new Set([...prev, ...pendingShops]))
      if (maxRaised) setLockedMaxDays(Number(maxDays) || 0)
      setMsg({ kind: 'good', text: 'Je toevoegingen zijn opgeslagen.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Toevoegen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  const canPrev = month > thisMonth
  const canNext = month < addMonths(thisMonth, 6)
  const pendingDayCount = [...days].filter((d) => !lockedDays.has(d)).length
  const pendingShopCount = prefShops.filter((id) => !lockedShops.has(id)).length
  const maxRaisedPending = locked && (Number(maxDays) || 0) > lockedMaxDays
  const hasPending = pendingDayCount > 0 || pendingShopCount > 0 || maxRaisedPending

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const blanks = leadingBlanks(month)
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(month.getFullYear(), month.getMonth(), d)
    cells.push({ d, str: ymd(dateObj), isToday: ymd(dateObj) === ymd(today) })
  }

  return (
    <Shell employee={employee} onLogout={onLogout}>
      <MyDeadlineBanner employee={employee} />
      <div className="tabs">
        <button className={'tab' + (view === 'mine' ? ' active' : '')} onClick={() => setView('mine')}>
          Mijn beschikbaarheid
        </button>
        <button className={'tab' + (view === 'team' ? ' active' : '')} onClick={() => setView('team')}>
          Wie werkt wanneer
        </button>
      </div>
      {view === 'team' ? <TeamCalendar employee={employee} /> : (
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
      ) : !released ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="section-title">Nog niet vrijgegeven</div>
          <div className="muted">
            Deze maand is nog niet vrijgegeven door de winkels. Je kunt je beschikbaarheid hier nog niet ingeven —
            kijk later terug of probeer een andere maand.
          </div>
        </div>
      ) : (
        <>
          <div className="banner ok">
            <div className="row">
              <span>
                Je gaf {days.size} {days.size === 1 ? 'dag' : 'dagen'} door
                {Number(maxDays) > 0 ? ` · je wil er max ${maxDays} werken` : ''}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Hoeveel dagen wil je deze maand maximaal werken?</div>
            <input
              className="input"
              type="number"
              min={locked ? lockedMaxDays : 0}
              max="31"
              style={{ width: 110 }}
              value={maxDays}
              onChange={(e) => setMaxDays(e.target.value)}
              onBlur={onMaxBlur}
            />
            {locked && (
              <div className="hint" style={{ marginBottom: 0 }}>
                Je kunt dit aantal enkel nog optrekken (minimaal {lockedMaxDays}), niet verlagen.
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title">In welke winkels wil je werken?</div>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
              De volgorde is je voorkeur — je eerste keuze proberen we eerst.
            </div>
            {shops.map((s) => {
              const rank = prefShops.indexOf(s.id)
              const on = rank >= 0
              const isLocked = lockedShops.has(s.id)
              const isPending = on && locked && !isLocked
              return (
                <div className="row-item" key={s.id}>
                  <span>
                    {on && <strong style={{ color: 'var(--clay)', marginRight: 6 }}>{rank + 1}.</strong>}
                    {s.name}
                    {isPending && (
                      <span className="hint" style={{ marginLeft: 8, color: 'var(--clay)' }}>nog toe te voegen</span>
                    )}
                  </span>
                  <button
                    className={'sw' + (on ? ' on' : '')}
                    onClick={() => toggleShop(s.id)}
                    disabled={locked && isLocked}
                    aria-label={s.name}
                  >
                    <span className="knob" />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="card">
            <div className="section-title">Op welke dagen kun je werken?</div>
            <div className="weekhead">
              {WEEK.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid">
              {cells.map((c, i) =>
                c === null ? (
                  <div key={`b${i}`} className="day empty" />
                ) : (
                  <div
                    key={c.str}
                    className={
                      'day' +
                      (!openSet.has(c.str) ? ' closed' : '') +
                      (days.has(c.str) ? (locked && !lockedDays.has(c.str) ? ' pending' : ' sel') : '') +
                      (c.isToday ? ' today' : '')
                    }
                    onClick={() => toggleDay(c.str)}
                  >
                    {c.d}
                    {lockedDays.has(c.str) && <span className="lock">●</span>}
                  </div>
                ),
              )}
            </div>
            <div className="legend">
              <span className="item">
                <span className="sw" style={{ background: 'var(--avail-bg)' }} /> Beschikbaar
              </span>
              <span className="item">
                <span className="sw" style={{ background: 'var(--surface-2)' }} /> Gesloten
              </span>
              {locked && (
                <span className="item">
                  <span className="sw" style={{ background: 'var(--clay-soft)' }} /> Nog toe te voegen
                </span>
              )}
            </div>
          </div>

          {!locked ? (
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={askConfirm}
              disabled={busy}
            >
              {busy ? 'Bezig…' : 'Bevestigen'}
            </button>
          ) : hasPending ? (
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={() => setDialog('extra')}
              disabled={busy}
            >
              {busy ? 'Bezig…' : 'Wijzigingen toevoegen'}
            </button>
          ) : null}

          <div className="hint" style={{ textAlign: 'center' }}>
            {locked
              ? 'Je doorgave staat vast. Je kunt nog extra dagen, winkels en een hoger maximum toevoegen; bevestigde keuzes (●) kun je niet meer verwijderen.'
              : 'Je keuzes worden automatisch bewaard.'}
          </div>
          {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}
        </>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'extra' ? 'Wijzigingen toevoegen?' : 'Beschikbaarheden bevestigen?'}
        message={
          dialog === 'extra'
            ? 'Je extra dagen, winkels en/of hoger maximum worden definitief toegevoegd. Verwijderen of verlagen kan nadien niet meer. Toevoegen?'
            : 'Als je bevestigt, kun je je doorgegeven dagen, winkels en maximum niet meer verwijderen of verlagen — toevoegen of optrekken kan nog wel. Dit kun je niet ongedaan maken. Ben je zeker?'
        }
        confirmLabel={dialog === 'extra' ? 'Ja, toevoegen' : 'Ja, bevestigen'}
        onConfirm={dialog === 'extra' ? doAddExtra : doConfirm}
        onCancel={() => setDialog(null)}
      />
      </>
      )}
    </Shell>
  )
}
