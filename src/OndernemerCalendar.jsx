import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell.jsx'

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
// maandag = 0
function leadingBlanks(date) {
  return (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7
}

export default function OndernemerCalendar({ employee, onLogout }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [month, setMonth] = useState(thisMonth)
  const [shops, setShops] = useState([]) // { shop_id, name, must_operate }
  const [openSet, setOpenSet] = useState(new Set())
  const [dbDays, setDbDays] = useState(new Set()) // wat in de DB staat
  const [selected, setSelected] = useState(new Set()) // huidige selectie
  const [buyouts, setBuyouts] = useState(new Set()) // shop_ids afgekocht deze maand
  const [submission, setSubmission] = useState(null) // { id, confirmed_at }
  const [required, setRequired] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { kind, text }

  const monthStart = ymd(firstOfMonth(month))
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const locked = !!submission?.confirmed_at

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const { data: es } = await supabase
        .from('entrepreneur_shops')
        .select('shop_id, must_operate, start_date, end_date, shops(name)')
        .eq('entrepreneur_id', employee.id)

      const activeShops = (es || []).filter(
        (r) => r.start_date <= monthEnd && (!r.end_date || r.end_date >= monthStart),
      )
      const shopList = activeShops.map((r) => ({
        shop_id: r.shop_id,
        name: r.shops?.name || 'Winkel',
        must_operate: r.must_operate,
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

      let days = new Set()
      if (sub) {
        const { data: ad } = await supabase
          .from('availability_days')
          .select('day')
          .eq('submission_id', sub.id)
          .eq('kind', 'mandatory')
        days = new Set((ad || []).map((r) => r.day))
      }
      setDbDays(new Set(days))
      setSelected(new Set(days))

      const { data: bo } = await supabase
        .from('buyouts')
        .select('shop_id')
        .eq('entrepreneur_id', employee.id)
        .eq('month_start', monthStart)
      const boSet = new Set((bo || []).map((r) => r.shop_id))
      setBuyouts(boSet)

      const nOperating = shopList.filter((s) => s.must_operate && !boSet.has(s.shop_id)).length
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

  function toggleDay(dateStr) {
    if (!openSet.has(dateStr)) return
    const next = new Set(selected)
    if (next.has(dateStr)) {
      if (locked && dbDays.has(dateStr)) {
        setMsg({ kind: 'err', text: 'Deze dag is al bevestigd en kan niet meer verwijderd worden.' })
        return
      }
      next.delete(dateStr)
    } else {
      next.add(dateStr)
    }
    setSelected(next)
    setMsg(null)
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

  async function ensureSubmission() {
    if (submission) return submission
    const { data, error } = await supabase
      .from('availability_submissions')
      .insert({ employee_id: employee.id, month_start: monthStart, max_extra_days: 0 })
      .select('id, confirmed_at')
      .single()
    if (error) throw error
    setSubmission(data)
    return data
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const sub = await ensureSubmission()
      const toAdd = [...selected].filter((d) => !dbDays.has(d))
      const toRemove = [...dbDays].filter((d) => !selected.has(d))
      if (toRemove.length) {
        await supabase
          .from('availability_days')
          .delete()
          .eq('submission_id', sub.id)
          .eq('kind', 'mandatory')
          .in('day', toRemove)
      }
      if (toAdd.length) {
        await supabase
          .from('availability_days')
          .insert(toAdd.map((d) => ({ submission_id: sub.id, day: d, kind: 'mandatory' })))
      }
      setDbDays(new Set(selected))
      setMsg({ kind: 'good', text: 'Bewaard.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bewaren mislukt.' })
    } finally {
      setSaving(false)
    }
  }

  async function confirm() {
    if (selected.size < required) {
      setMsg({ kind: 'err', text: `Je hebt minstens ${required} beschikbaarheden nodig.` })
      return
    }
    setSaving(true)
    try {
      const sub = await ensureSubmission()
      const toAdd = [...selected].filter((d) => !dbDays.has(d))
      if (toAdd.length) {
        await supabase
          .from('availability_days')
          .insert(toAdd.map((d) => ({ submission_id: sub.id, day: d, kind: 'mandatory' })))
        setDbDays(new Set(selected))
      }
      const { data, error } = await supabase
        .from('availability_submissions')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', sub.id)
        .select('id, confirmed_at')
        .single()
      if (error) throw error
      setSubmission(data)
      setMsg({ kind: 'good', text: 'Bevestigd. Je kunt nog dagen toevoegen, maar niet meer verwijderen.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bevestigen mislukt.' })
    } finally {
      setSaving(false)
    }
  }

  // maand-navigatie: 3 maanden vooruit, en niet vooruit als de huidige maand onder het minimum zit
  const minMonth = thisMonth
  const maxMonth = addMonths(thisMonth, 2)
  const canPrev = month > minMonth
  const meetsMin = selected.size >= required
  const canNext = month < maxMonth && meetsMin

  const count = selected.size

  // bouw de kalendercellen
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
          title={!meetsMin ? 'Geef eerst genoeg beschikbaarheden door voor deze maand' : ''}
        >
          ›
        </button>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>
          Laden…
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
                      (selected.has(c.str) ? ' sel' : '') +
                      (c.isToday ? ' today' : '')
                    }
                    onClick={() => toggleDay(c.str)}
                  >
                    {c.d}
                    {locked && dbDays.has(c.str) && <span className="lock">●</span>}
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
            </div>
          </div>

          {shops.some((s) => s.must_operate) && (
            <div className="card">
              <div className="section-title">Uitbatingsdag afkopen (€200)</div>
              {shops
                .filter((s) => s.must_operate)
                .map((s) => (
                  <div className="row-item" key={s.shop_id}>
                    <span>{s.name}</span>
                    <button
                      className={'sw' + (buyouts.has(s.shop_id) ? ' on' : '')}
                      onClick={() => toggleBuyout(s.shop_id)}
                      disabled={locked}
                      aria-label={`Afkoop ${s.name}`}
                    >
                      <span className="knob" />
                    </button>
                  </div>
                ))}
              <div className="hint">Een afgekochte winkel telt niet meer mee voor je minimum.</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-block" onClick={save} disabled={saving}>
              {saving ? 'Bezig…' : 'Bewaren'}
            </button>
            <button className="btn btn-primary btn-block" onClick={confirm} disabled={saving || locked}>
              {locked ? 'Bevestigd' : 'Bevestigen'}
            </button>
          </div>
          {!locked && <div className="hint" style={{ textAlign: 'center' }}>Na bevestigen kun je enkel nog dagen toevoegen.</div>}
          {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}
        </>
      )}
    </Shell>
  )
}
