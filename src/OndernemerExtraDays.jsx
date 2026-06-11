import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
const WEEK = ['ma','di','wo','do','vr','za','zo']

function ymd(d) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }

export default function OndernemerExtraDays({ employee }) {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [month, setMonth] = useState(thisMonth)
  const [openSet, setOpenSet] = useState(new Set())
  const [days, setDays] = useState(new Set())
  const [maxDays, setMaxDays] = useState(0)
  const [submissionId, setSubmissionId] = useState(null)
  const [released, setReleased] = useState(true)
  const [shops, setShops] = useState([])
  const [shopPrefs, setShopPrefs] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  const monthStart = ymd(month)
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))

  const load = useCallback(async () => {
    if (!employee?.id) return
    setLoading(true)
    try {
      // Open dagen: union van alle winkels waar de ondernemer ingeschreven is
      const { data: es } = await supabase
        .from('entrepreneur_shops')
        .select('shop_id, start_date, end_date, shops(name)')
        .eq('entrepreneur_id', employee.id)
      const activeShops = (es || []).filter(
        (r) => r.start_date <= monthEnd && (!r.end_date || r.end_date >= monthStart),
      )
      setShops(activeShops.map((r) => ({ id: r.shop_id, name: r.shops?.name || 'Onbekend' })))
      const shopIds = activeShops.map((r) => r.shop_id)

      if (shopIds.length === 0) {
        setOpenSet(new Set())
      } else {
        const { data: sh } = await supabase
          .from('shifts')
          .select('shift_date')
          .in('shop_id', shopIds)
          .eq('kind', 'standard')
          .gte('shift_date', monthStart)
          .lte('shift_date', monthEnd)
        setOpenSet(new Set((sh || []).map((s) => s.shift_date)))
      }

      // Release check
      const { data: rel } = await supabase
        .from('shop_availability_release')
        .select('shop_id')
        .in('shop_id', shopIds.length ? shopIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('month_start', monthStart)
      setReleased((rel || []).length > 0)

      // Bestaande submission + extra dagen
      const { data: sub } = await supabase
        .from('availability_submissions')
        .select('id, max_extra_days')
        .eq('employee_id', employee.id)
        .eq('month_start', monthStart)
        .maybeSingle()
      setSubmissionId(sub?.id || null)
      setMaxDays(sub?.max_extra_days || 0)

      if (sub?.id) {
        const { data: ad } = await supabase
          .from('availability_days')
          .select('day')
          .eq('submission_id', sub.id)
          .eq('kind', 'extra')
        setDays(new Set((ad || []).map((r) => r.day)))

        const { data: prefs } = await supabase
          .from('availability_shop_prefs')
          .select('shop_id')
          .eq('submission_id', sub.id)
        setShopPrefs(new Set((prefs || []).map((p) => p.shop_id)))
      } else {
        setDays(new Set())
        setShopPrefs(new Set())
      }
    } catch (e) {
      setMsg({ kind: 'err', text: 'Laden mislukt.' })
    } finally {
      setLoading(false)
    }
  }, [employee?.id, monthStart, monthEnd])

  useEffect(() => { load() }, [load])

  async function ensureSubmission() {
    if (submissionId) return submissionId
    const { data, error } = await supabase
      .from('availability_submissions')
      .insert({ employee_id: employee.id, month_start: monthStart, max_extra_days: maxDays })
      .select('id').single()
    if (error) throw error
    setSubmissionId(data.id)
    return data.id
  }

  async function toggleDay(dateStr) {
    if (!openSet.has(dateStr) || dateStr < ymd(today)) return
    if (!released) {
      setMsg({ kind: 'err', text: 'Deze maand is nog niet vrijgegeven.' })
      return
    }
    const has = days.has(dateStr)
    setDays((prev) => { const n = new Set(prev); has ? n.delete(dateStr) : n.add(dateStr); return n })
    setMsg(null)
    try {
      const sub = await ensureSubmission()
      if (has) {
        await supabase.from('availability_days').delete().eq('submission_id', sub).eq('day', dateStr).eq('kind', 'extra')
      } else {
        await supabase.from('availability_days').insert({ submission_id: sub, day: dateStr, kind: 'extra' })
      }
    } catch (e) {
      setDays((prev) => { const n = new Set(prev); has ? n.add(dateStr) : n.delete(dateStr); return n })
      setMsg({ kind: 'err', text: 'Opslaan mislukt.' })
    }
  }

  async function saveMax(n) {
    setMaxDays(n)
    try {
      const sub = await ensureSubmission()
      await supabase.from('availability_submissions').update({ max_extra_days: n }).eq('id', sub)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Kon maximum niet opslaan.' })
    }
  }

  async function toggleShopPref(shopId) {
    setMsg(null)
    if (!submissionId) {
      try { await ensureSubmission() } catch {
        setMsg({ kind: 'err', text: 'Kon voorkeur niet opslaan.' })
        return
      }
    }
    const has = shopPrefs.has(shopId)
    setShopPrefs((prev) => { const n = new Set(prev); has ? n.delete(shopId) : n.add(shopId); return n })
    try {
      const sub = submissionId || (await ensureSubmission())
      if (has) {
        await supabase.from('availability_shop_prefs').delete().eq('submission_id', sub).eq('shop_id', shopId)
      } else {
        await supabase.from('availability_shop_prefs').insert({ submission_id: sub, shop_id: shopId, rank: shopPrefs.size + 1 })
      }
    } catch (e) {
      setShopPrefs((prev) => { const n = new Set(prev); has ? n.add(shopId) : n.delete(shopId); return n })
      setMsg({ kind: 'err', text: 'Voorkeur opslaan mislukt.' })
    }
  }

  // Kalender bouwen
  const firstWd = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstWd; i++) cells.push(null)
  for (let d = 1; d <= dim; d++) cells.push({ d, str: ymd(new Date(month.getFullYear(), month.getMonth(), d)) })

  const canPrev = month > addMonths(thisMonth, -2)
  const canNext = month < addMonths(thisMonth, 6)

  return (
    <>
      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>‹</button>
        <span className="label">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <button className="icon-btn" onClick={() => canNext && setMonth(addMonths(month, 1))} disabled={!canNext}>›</button>
      </div>

      <div className="card" style={{ background: '#e3edfa', borderColor: '#7da6d4' }}>
        <div className="section-title" style={{ color: '#1f4974' }}>Extra werkdagen (betaald)</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Hier geef je dagen aan waarop je wil werken bóvenop je verplichte uitbatingsdagen. Deze dagen worden vergoed.
          Niet verplicht; alleen invullen als je extra wil draaien.
        </div>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 16, textAlign: 'center' }}>Laden…</div>
      ) : !released ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">Deze maand is nog niet vrijgegeven. Wacht tot je shopmanager hem opent.</div>
        </div>
      ) : (
        <>
          <div className="card">
            <label className="flbl">Hoeveel extra dagen wil je maximaal werken deze maand?</label>
            <input
              className="input fw"
              type="number"
              min={0}
              max={31}
              value={maxDays}
              onChange={(e) => saveMax(Math.max(0, Math.min(31, parseInt(e.target.value || '0', 10))))}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Je shopmanager plant je in volgens dit maximum. 0 = geen extra werkdagen.
            </div>
          </div>

          {shops.length > 1 && (
            <div className="card">
              <div className="section-title">In welke winkels wil je werken?</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Aanvinken in welke winkels je ingepland mag worden voor je extra dagen.
              </div>
              {shops.map((s) => (
                <div className="row-item" key={s.id}>
                  <span>{s.name}</span>
                  <button
                    className={'sw' + (shopPrefs.has(s.id) ? ' on' : '')}
                    onClick={() => toggleShopPref(s.id)}
                  >
                    <span className="knob" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="section-title">Klik dagen aan waarop je extra wil werken</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Je aangevinkte dagen: <strong>{days.size}</strong> · maximum dat je opgegeven hebt: <strong>{maxDays}</strong>
            </div>
            <div className="pgrid-hdr" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {WEEK.map((w) => (
                <span key={w} style={{ fontSize: 11, textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>{w}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {cells.map((c, i) => {
                if (!c) return <div key={'b' + i} />
                const open = openSet.has(c.str)
                const past = c.str < ymd(today)
                const chosen = days.has(c.str)
                const bg = !open ? 'var(--surface-2)' : chosen ? 'var(--paid-bg)' : 'var(--surface)'
                const border = chosen ? 'var(--paid-border, var(--line))' : 'var(--line)'
                return (
                  <div
                    key={c.str}
                    onClick={() => toggleDay(c.str)}
                    style={{
                      minHeight: 44, borderRadius: 8, padding: '6px 4px', textAlign: 'center',
                      background: bg, border: `1px solid ${border}`,
                      cursor: !open || past ? 'default' : 'pointer',
                      opacity: past ? 0.5 : 1,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.d}</div>
                    {chosen && <div style={{ fontSize: 10, color: '#1f4974' }}>extra</div>}
                  </div>
                )
              })}
            </div>
            <div className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
              Je extra dagen worden bewaard zodra je klikt — geen aparte bevestiging nodig.
            </div>
          </div>
        </>
      )}

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}
    </>
  )
}
