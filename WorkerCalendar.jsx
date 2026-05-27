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
function leadingBlanks(date) {
  return (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7
}

export default function WorkerCalendar({ employee, onLogout }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [month, setMonth] = useState(thisMonth)
  const [shops, setShops] = useState([]) // alle actieve winkels { id, name }
  const [prefShops, setPrefShops] = useState([]) // geordende lijst shop-ids (1e = voorkeur)
  const [openSet, setOpenSet] = useState(new Set())
  const [dbDays, setDbDays] = useState(new Set())
  const [selected, setSelected] = useState(new Set())
  const [maxDays, setMaxDays] = useState(0)
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const monthStart = ymd(firstOfMonth(month))
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const locked = !!submission?.confirmed_at

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const { data: shopRows } = await supabase
        .from('shops')
        .select('id, name')
        .eq('active', true)
        .order('name')
      const shopList = shopRows || []
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

      let days = new Set()
      let prefs = []
      if (sub) {
        const { data: ad } = await supabase
          .from('availability_days')
          .select('day')
          .eq('submission_id', sub.id)
          .eq('kind', 'work')
        days = new Set((ad || []).map((r) => r.day))
        const { data: pr } = await supabase
          .from('availability_shop_prefs')
          .select('shop_id, rank')
          .eq('submission_id', sub.id)
          .order('rank')
        prefs = (pr || []).map((r) => r.shop_id)
      }
      setDbDays(new Set(days))
      setSelected(new Set(days))
      setPrefShops(prefs)
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

  function toggleShop(shopId) {
    if (locked) return
    setPrefShops((prev) => (prev.includes(shopId) ? prev.filter((id) => id !== shopId) : [...prev, shopId]))
  }

  async function ensureSubmission() {
    if (submission) {
      // houd max_extra_days up-to-date
      await supabase
        .from('availability_submissions')
        .update({ max_extra_days: Number(maxDays) || 0 })
        .eq('id', submission.id)
      return submission
    }
    const { data, error } = await supabase
      .from('availability_submissions')
      .insert({ employee_id: employee.id, month_start: monthStart, max_extra_days: Number(maxDays) || 0 })
      .select('id, confirmed_at, max_extra_days')
      .single()
    if (error) throw error
    setSubmission(data)
    return data
  }

  async function syncPrefs(subId) {
    await supabase.from('availability_shop_prefs').delete().eq('submission_id', subId)
    if (prefShops.length) {
      await supabase
        .from('availability_shop_prefs')
        .insert(prefShops.map((shopId, i) => ({ submission_id: subId, shop_id: shopId, rank: i + 1 })))
    }
  }

  async function persist() {
    const sub = await ensureSubmission()
    const toAdd = [...selected].filter((d) => !dbDays.has(d))
    const toRemove = [...dbDays].filter((d) => !selected.has(d))
    if (toRemove.length) {
      await supabase
        .from('availability_days')
        .delete()
        .eq('submission_id', sub.id)
        .eq('kind', 'work')
        .in('day', toRemove)
    }
    if (toAdd.length) {
      await supabase
        .from('availability_days')
        .insert(toAdd.map((d) => ({ submission_id: sub.id, day: d, kind: 'work' })))
    }
    if (!locked) await syncPrefs(sub.id)
    setDbDays(new Set(selected))
    return sub
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      await persist()
      setMsg({ kind: 'good', text: 'Bewaard.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bewaren mislukt.' })
    } finally {
      setSaving(false)
    }
  }

  async function confirm() {
    if (prefShops.length === 0) {
      setMsg({ kind: 'err', text: 'Kies minstens één winkel waar je wil werken.' })
      return
    }
    if (selected.size === 0) {
      setMsg({ kind: 'err', text: 'Duid minstens één dag aan.' })
      return
    }
    setSaving(true)
    try {
      const sub = await persist()
      const { data, error } = await supabase
        .from('availability_submissions')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', sub.id)
        .select('id, confirmed_at, max_extra_days')
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

  const canPrev = month > thisMonth
  const canNext = month < addMonths(thisMonth, 2)

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
          <div className="banner ok">
            <div className="row">
              <span>
                Je gaf {selected.size} {selected.size === 1 ? 'dag' : 'dagen'} door
                {Number(maxDays) > 0 ? ` · je wil er max ${maxDays} werken` : ''}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Hoeveel dagen wil je deze maand maximaal werken?</div>
            <input
              className="input"
              type="number"
              min="0"
              max="31"
              style={{ width: 110 }}
              value={maxDays}
              disabled={locked}
              onChange={(e) => setMaxDays(e.target.value)}
            />
          </div>

          <div className="card">
            <div className="section-title">In welke winkels wil je werken?</div>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
              De volgorde is je voorkeur — je eerste keuze proberen we eerst.
            </div>
            {shops.map((s) => {
              const rank = prefShops.indexOf(s.id)
              const on = rank >= 0
              return (
                <div className="row-item" key={s.id}>
                  <span>
                    {on && <strong style={{ color: 'var(--clay)', marginRight: 6 }}>{rank + 1}.</strong>}
                    {s.name}
                  </span>
                  <button
                    className={'sw' + (on ? ' on' : '')}
                    onClick={() => toggleShop(s.id)}
                    disabled={locked}
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
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-block" onClick={save} disabled={saving}>
              {saving ? 'Bezig…' : 'Bewaren'}
            </button>
            <button className="btn btn-primary btn-block" onClick={confirm} disabled={saving || locked}>
              {locked ? 'Bevestigd' : 'Bevestigen'}
            </button>
          </div>
          {!locked && (
            <div className="hint" style={{ textAlign: 'center' }}>
              Na bevestigen kun je enkel nog dagen toevoegen.
            </div>
          )}
          {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}
        </>
      )}
    </Shell>
  )
}
