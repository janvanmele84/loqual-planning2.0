import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell.jsx'
import MyDeadlineBanner from './MyDeadlineBanner.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import TeamCalendar from './TeamCalendar.jsx'
import OndernemerExtraDays from './OndernemerExtraDays.jsx'
import MyMonthOverview from './MyMonthOverview.jsx'

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

export default function OndernemerCalendar({ employee, onLogout }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [month, setMonth] = useState(thisMonth)
  const [view, setView] = useState('mine') // 'mine' | 'team' | 'extra'
  const [showMonthOverview, setShowMonthOverview] = useState(false)
  const [shops, setShops] = useState([])
  const [openSet, setOpenSet] = useState(new Set())
  const [days, setDays] = useState(new Set()) // alle geselecteerde dagen
  const [lockedDays, setLockedDays] = useState(new Set()) // bevestigde dagen (niet verwijderbaar)
  const [buyouts, setBuyouts] = useState(new Set())
  const [submission, setSubmission] = useState(null)
  const [required, setRequired] = useState(0)
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
      const { data: es } = await supabase
        .from('entrepreneur_shops')
        .select('shop_id, must_operate, operate_days, start_date, end_date, shops(name)')
        .eq('entrepreneur_id', employee.id)

      const activeShops = (es || []).filter(
        (r) => r.start_date <= monthEnd && (!r.end_date || r.end_date >= monthStart),
      )
      const allShopIds = [...new Set(activeShops.map((r) => r.shop_id))]

      // Welke van zijn winkels gaven deze maand vrij?
      let releasedIds = new Set()
      if (allShopIds.length) {
        const { data: rel } = await supabase
          .from('shop_availability_release')
          .select('shop_id')
          .eq('month_start', monthStart)
          .in('shop_id', allShopIds)
        releasedIds = new Set((rel || []).map((r) => r.shop_id))
      }
      setReleased(releasedIds.size > 0)

      const shopList = activeShops
        .filter((r) => releasedIds.has(r.shop_id))
        .map((r) => ({
          shop_id: r.shop_id,
          name: r.shops?.name || 'Winkel',
          must_operate: r.must_operate,
          operate_days: r.operate_days || 1,
        }))
      setShops(shopList)
      const shopIds = shopList.map((s) => s.shop_id)

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
        .select('id, confirmed_at')
        .eq('employee_id', employee.id)
        .eq('month_start', monthStart)
        .maybeSingle()
      setSubmission(sub || null)

      let dd = new Set()
      if (sub) {
        const { data: ad } = await supabase
          .from('availability_days')
          .select('day')
          .eq('submission_id', sub.id)
          .eq('kind', 'mandatory')
        dd = new Set((ad || []).map((r) => r.day))
      }
      setDays(dd)
      // enkel bij een bevestigde doorgave staan de bestaande dagen vast
      setLockedDays(sub?.confirmed_at ? new Set(dd) : new Set())

      const { data: bo } = await supabase
        .from('buyouts')
        .select('shop_id')
        .eq('entrepreneur_id', employee.id)
        .eq('month_start', monthStart)
      const boSet = new Set((bo || []).map((r) => r.shop_id))
      setBuyouts(boSet)

      const nOperating = shopList
        .filter((s) => s.must_operate && !boSet.has(s.shop_id))
        .reduce((sum, s) => sum + (s.operate_days || 1), 0)
      const { data: req } = await supabase.rpc('required_availability', { n_operating_shops: nOperating })
      setRequired(req || 0)
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
      .upsert({ employee_id: employee.id, month_start: monthStart }, { onConflict: 'employee_id,month_start' })
      .select('id, confirmed_at')
      .single()
    if (error) throw error
    setSubmission(data)
    return data
  }

  async function toggleDay(dateStr) {
    if (!openSet.has(dateStr)) return
    const has = days.has(dateStr)

    if (locked) {
      // bevestigde dagen kunnen niet weg; nieuwe dagen mag je vrij toggelen (nog niet opgeslagen)
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

    // niet bevestigd: vrij spel, meteen bewaard
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
          .eq('kind', 'mandatory')
          .eq('day', dateStr)
      } else {
        await supabase.from('availability_days').insert({ submission_id: sub.id, day: dateStr, kind: 'mandatory' })
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

  async function toggleBuyout(shopId) {
    if (locked) return
    setMsg(null)
    try {
      if (buyouts.has(shopId)) {
        await supabase
          .from('buyouts')
          .delete()
          .eq('entrepreneur_id', employee.id)
          .eq('shop_id', shopId)
          .eq('month_start', monthStart)
      } else {
        await supabase
          .from('buyouts')
          .insert({ entrepreneur_id: employee.id, shop_id: shopId, month_start: monthStart })
      }
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Afkoop bijwerken mislukt.' })
    }
  }

  function askConfirm() {
    if (days.size < required) {
      setMsg({ kind: 'err', text: `Je hebt minstens ${required} beschikbaarheden nodig.` })
      return
    }
    setDialog('confirm')
  }

  async function doConfirm() {
    setDialog(null)
    setBusy(true)
    try {
      const sub = await ensureSubmission()
      const { data, error } = await supabase
        .from('availability_submissions')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', sub.id)
        .select('id, confirmed_at')
        .single()
      if (error) throw error
      setSubmission(data)
      setLockedDays(new Set(days))
      setMsg({ kind: 'good', text: 'Bevestigd. Je kunt nog extra dagen toevoegen, maar niet meer verwijderen.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bevestigen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doAddExtra() {
    setDialog(null)
    const pending = [...days].filter((d) => !lockedDays.has(d))
    if (!pending.length) return
    setBusy(true)
    try {
      const sub = await ensureSubmission()
      await supabase
        .from('availability_days')
        .insert(pending.map((d) => ({ submission_id: sub.id, day: d, kind: 'mandatory' })))
      setLockedDays((prev) => new Set([...prev, ...pending]))
      setMsg({ kind: 'good', text: `${pending.length} extra ${pending.length === 1 ? 'dag' : 'dagen'} toegevoegd.` })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Toevoegen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  const minMonth = thisMonth
  const maxMonth = addMonths(thisMonth, 6)
  const canPrev = month > minMonth
  const meetsMin = days.size >= required
  const canNext = month < maxMonth && (meetsMin || openSet.size === 0)
  const pendingCount = [...days].filter((d) => !lockedDays.has(d)).length

  const count = days.size
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn" onClick={() => setShowMonthOverview(true)}>
          📅 Mijn maand
        </button>
      </div>
      <div className="tabs">
        <button className={'tab' + (view === 'mine' ? ' active' : '')} onClick={() => setView('mine')}>
          Verplichte dagen
        </button>
        <button className={'tab' + (view === 'extra' ? ' active' : '')} onClick={() => setView('extra')}>
          Extra werkdagen
        </button>
        <button className={'tab' + (view === 'team' ? ' active' : '')} onClick={() => setView('team')}>
          Wie werkt wanneer
        </button>
      </div>
      {view === 'team' ? <TeamCalendar employee={employee} /> : view === 'extra' ? <OndernemerExtraDays employee={employee} /> : (
      <>
      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>
          ‹
        </button>
        <span className="label">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </span>
        <button
          className="icon-btn"
          onClick={() => canNext && setMonth(addMonths(month, 1))}
          disabled={!canNext}
          title={!meetsMin && openSet.size > 0 ? 'Geef eerst genoeg beschikbaarheden door voor deze maand' : ''}
        >
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
            Deze maand is nog niet vrijgegeven door je winkel. Je kunt je beschikbaarheid hier nog niet ingeven —
            kijk later terug of probeer een andere maand.
          </div>
        </div>
      ) : (
        <>
          <div className={`banner ${meetsMin ? 'ok' : 'todo'}`}>
            <div className="row">
              <span>
                {meetsMin
                  ? `${count} van ${required} beschikbaarheden — volledig`
                  : `${count} van ${required} beschikbaarheden — geef er nog ${Math.max(required - count, 0)} door`}
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${required ? Math.min(100, Math.round((count / required) * 100)) : 100}%` }} />
            </div>
          </div>

          <div className="card">
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
              <span className="item">
                <span className="sw" style={{ boxShadow: 'inset 0 0 0 2px var(--clay)' }} /> Vandaag
              </span>
              {locked && (
                <span className="item">
                  <span className="sw" style={{ background: 'var(--clay-soft)' }} /> Nog toe te voegen
                </span>
              )}
            </div>
          </div>

          {locked && (
            <div style={{
              background: '#e8efe4', color: '#2f5a31', border: '1px solid #7fb869',
              borderRadius: 12, padding: '12px 14px', marginBottom: 12, lineHeight: 1.4,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>✓ Beschikbaarheden bevestigd</div>
              <div style={{ fontSize: 13 }}>
                Je hebt je beschikbaarheden voor deze maand al bevestigd en kan enkel nog toevoegen, niet aanpassen.
		Wil je toch nog iets wijzigen? Neem contact op met je shopmanager.
              </div>
            </div>
          )}

          {shops.some((s) => s.must_operate) && (
            <div className="card">
              <div className="section-title">Jouw uitbatingsdagen per winkel</div>
              {!locked && (
                <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                  Zet de schakelaar aan om een dag af te kopen (€200). Een afgekochte winkel telt niet meer mee voor je minimum aantal beschikbaarheden.
                </div>
              )}
              {shops
                .filter((s) => s.must_operate)
                .map((s) => {
                  const isAfgekocht = buyouts.has(s.shop_id)
                  return (
                    <div className="row-item" key={s.shop_id}>
                      <span>
                        {s.name}
                        <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                          · {s.operate_days || 1} {(s.operate_days || 1) === 1 ? 'dag' : 'dagen'}
                        </span>
                      </span>
                      {locked ? (
                        <span style={{
                          fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 8,
                          background: isAfgekocht ? '#fff2dd' : '#e8efe4',
                          color: isAfgekocht ? '#8a571f' : '#2f5a31',
                        }}>
                          {isAfgekocht ? `Afgekocht (€${200 * (s.operate_days || 1)})` : 'Wordt uitgebaat'}
                        </span>
                      ) : (
                        <button
                          className={'sw' + (isAfgekocht ? ' on' : '')}
                          onClick={() => toggleBuyout(s.shop_id)}
                          aria-label={`Afkoop ${s.name}`}
                        >
                          <span className="knob" />
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          )}

          {!locked ? (
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={askConfirm}
              disabled={busy}
            >
              {busy ? 'Bezig…' : 'Bevestigen'}
            </button>
          ) : pendingCount > 0 ? (
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={() => setDialog('extra')}
              disabled={busy}
            >
              {busy ? 'Bezig…' : `Extra ${pendingCount === 1 ? 'dag' : 'dagen'} toevoegen (${pendingCount})`}
            </button>
          ) : null}

          <div className="hint" style={{ textAlign: 'center' }}>
            {locked
              ? 'Je doorgave staat vast. Je kan nog extra dagen vrij aanklikken en daarna toevoegen met de blauwe knop hieronder; bevestigde dagen (●) kun je niet meer verwijderen.'
              : `Je keuzes worden automatisch bewaard. Je mag meer dagen aanklikken dan het minimum (${required}) — extra dagen zijn welkom.`}
          </div>
          {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}
        </>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'extra' ? 'Extra dagen toevoegen?' : 'Beschikbaarheden bevestigen?'}
        message={
          dialog === 'extra'
            ? 'Deze extra dagen worden definitief toegevoegd en kun je nadien niet meer verwijderen. Toevoegen?'
            : 'Als je bevestigt, kun je je doorgegeven dagen niet meer wijzigen of verwijderen — toevoegen kan nog wel. Dit kun je niet ongedaan maken. Ben je zeker?'
        }
        confirmLabel={dialog === 'extra' ? 'Ja, toevoegen' : 'Ja, bevestigen'}
        onConfirm={dialog === 'extra' ? doAddExtra : doConfirm}
        onCancel={() => setDialog(null)}
      />
      </>
      )}
      {showMonthOverview && (
        <MyMonthOverview employee={employee} onClose={() => setShowMonthOverview(false)} />
      )}
    </Shell>
  )
}
