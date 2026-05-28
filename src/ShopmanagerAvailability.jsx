import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtList = (set, monthStart) => {
  if (!set || set.size === 0) return null
  const ms = monthStart
  return [...set].sort().map((d) => Number(d.slice(8))).join(', ')
}

export default function ShopmanagerAvailability({ shopId }) {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [month, setMonth] = useState(addMonths(thisMonth, 1)) // default = volgende maand
  const monthStart = ymd(month)
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const monthIsPast = month < thisMonth

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [openSet, setOpenSet] = useState(new Set())
  const [ondernemers, setOndernemers] = useState([])
  const [werkers, setWerkers] = useState([])
  const [editing, setEditing] = useState(null) // null | {kind:'ond'|'werk', person}
  const [msg, setMsg] = useState(null)
  const ensureRef = useRef({}) // person.id -> Promise<submission_id>

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    ensureRef.current = {}
    try {
      // 1) Open dagen van DEZE winkel deze maand
      const { data: shifts } = await supabase
        .from('shifts')
        .select('shift_date')
        .eq('shop_id', shopId).eq('kind', 'standard')
        .gte('shift_date', monthStart).lte('shift_date', monthEnd)
      setOpenSet(new Set((shifts || []).map((s) => s.shift_date)))

      // 2) Ondernemers gekoppeld aan deze winkel + actief deze maand
      const { data: links } = await supabase
        .from('entrepreneur_shops')
        .select('entrepreneur_id, start_date, end_date')
        .eq('shop_id', shopId)
      const activeIds = [...new Set((links || [])
        .filter((l) => l.start_date <= monthEnd && (!l.end_date || l.end_date >= monthStart))
        .map((l) => l.entrepreneur_id))]

      let ondRecs = []
      if (activeIds.length) {
        const { data } = await supabase.from('employees')
          .select('id, first_name, last_name, company_name')
          .in('id', activeIds).eq('active', true).order('first_name')
        ondRecs = data || []
      }

      const { data: ondSubs } = activeIds.length
        ? await supabase.from('availability_submissions')
            .select('id, employee_id, confirmed_at')
            .in('employee_id', activeIds).eq('month_start', monthStart)
        : { data: [] }
      const subByEmp = new Map((ondSubs || []).map((s) => [s.employee_id, s]))
      const subIds = (ondSubs || []).map((s) => s.id)
      const { data: ondDays } = subIds.length
        ? await supabase.from('availability_days')
            .select('submission_id, day, kind').in('submission_id', subIds)
        : { data: [] }
      const manSet = new Map(), extSet = new Map()
      ;(ondDays || []).forEach((d) => {
        const m = d.kind === 'mandatory' ? manSet : d.kind === 'extra' ? extSet : null
        if (!m) return
        if (!m.has(d.submission_id)) m.set(d.submission_id, new Set())
        m.get(d.submission_id).add(d.day)
      })

      setOndernemers(ondRecs.map((e) => {
        const sub = subByEmp.get(e.id)
        return {
          id: e.id, first_name: e.first_name, last_name: e.last_name, company_name: e.company_name,
          submission_id: sub?.id || null,
          confirmed_at: sub?.confirmed_at || null,
          mandatory: sub ? (manSet.get(sub.id) || new Set()) : new Set(),
          extra: sub ? (extSet.get(sub.id) || new Set()) : new Set(),
        }
      }))

      // 3) Flexi/jobstudent met deze winkel in hun voorkeuren voor deze maand
      const { data: prefs } = await supabase
        .from('availability_shop_prefs').select('submission_id, rank').eq('shop_id', shopId)
      const prefSubIds = [...new Set((prefs || []).map((p) => p.submission_id))]
      const rankBySub = new Map((prefs || []).map((p) => [p.submission_id, p.rank]))

      const { data: werkSubs } = prefSubIds.length
        ? await supabase.from('availability_submissions')
            .select('id, employee_id, confirmed_at, max_extra_days')
            .in('id', prefSubIds).eq('month_start', monthStart)
        : { data: [] }
      const werkSubIds = (werkSubs || []).map((s) => s.id)
      const werkEmpIds = [...new Set((werkSubs || []).map((s) => s.employee_id))]
      const { data: werkEmps } = werkEmpIds.length
        ? await supabase.from('employees')
            .select('id, first_name, last_name, role').in('id', werkEmpIds)
            .in('role', ['flexi', 'jobstudent']).eq('active', true)
        : { data: [] }
      const empMap = new Map((werkEmps || []).map((e) => [e.id, e]))
      const { data: werkDays } = werkSubIds.length
        ? await supabase.from('availability_days')
            .select('submission_id, day').in('submission_id', werkSubIds).eq('kind', 'work')
        : { data: [] }
      const workSet = new Map()
      ;(werkDays || []).forEach((d) => {
        if (!workSet.has(d.submission_id)) workSet.set(d.submission_id, new Set())
        workSet.get(d.submission_id).add(d.day)
      })

      setWerkers(
        (werkSubs || []).map((sub) => {
          const e = empMap.get(sub.employee_id)
          if (!e) return null
          return {
            id: e.id, first_name: e.first_name, last_name: e.last_name, role: e.role,
            submission_id: sub.id, confirmed_at: sub.confirmed_at, max: sub.max_extra_days || 0,
            rank: rankBySub.get(sub.id) || 99,
            work: workSet.get(sub.id) || new Set(),
          }
        }).filter(Boolean)
          .sort((a, b) => (a.rank - b.rank) || a.first_name.localeCompare(b.first_name)),
      )
    } catch (e) {
      setMsg({ kind: 'err', text: 'Laden mislukt.' })
    } finally {
      setLoading(false)
    }
  }, [shopId, monthStart, monthEnd])

  useEffect(() => { load() }, [load])

  async function getSubmissionId(person) {
    if (person.submission_id) return person.submission_id
    if (ensureRef.current[person.id]) return ensureRef.current[person.id]
    const p = (async () => {
      const { data, error } = await supabase.rpc('manager_ensure_submission', {
        p_employee: person.id, p_month: monthStart,
      })
      if (error) throw error
      return data
    })()
    ensureRef.current[person.id] = p
    return p
  }

  async function toggleDay(personKind, person, kind, dayStr, currentlyOn) {
    if (monthIsPast) return
    const willBeOn = !currentlyOn

    // 1) Onmiddellijke (optimistische) UI-update
    let updated
    if (personKind === 'ond') {
      const newMan = new Set(person.mandatory)
      const newExt = new Set(person.extra)
      if (kind === 'mandatory') {
        if (willBeOn) { newMan.add(dayStr); newExt.delete(dayStr) } else newMan.delete(dayStr)
      } else {
        if (willBeOn) { newExt.add(dayStr); newMan.delete(dayStr) } else newExt.delete(dayStr)
      }
      updated = { ...person, mandatory: newMan, extra: newExt }
      setOndernemers((prev) => prev.map((o) => (o.id === person.id ? updated : o)))
    } else {
      const newWork = new Set(person.work)
      if (willBeOn) newWork.add(dayStr); else newWork.delete(dayStr)
      updated = { ...person, work: newWork }
      setWerkers((prev) => prev.map((w) => (w.id === person.id ? updated : w)))
    }
    setEditing((cur) => (cur && cur.person.id === person.id ? { kind: personKind, person: updated } : cur))

    // 2) Opslaan op de achtergrond
    try {
      const sid = await getSubmissionId(person)
      if (!person.submission_id) {
        // submission_id terugschrijven in de state zodat volgende kliks hem hebben
        const apply = (x) => (x.id === person.id ? { ...x, submission_id: sid } : x)
        if (personKind === 'ond') setOndernemers((prev) => prev.map(apply))
        else setWerkers((prev) => prev.map(apply))
        setEditing((cur) => (cur && cur.person.id === person.id
          ? { kind: personKind, person: { ...cur.person, submission_id: sid } } : cur))
      }
      const { error } = await supabase.rpc('manager_set_availability_day', {
        p_submission: sid, p_day: dayStr, p_kind: kind, p_present: willBeOn,
      })
      if (error) throw error
    } catch (e) {
      setMsg({ kind: 'err', text: 'Opslaan mislukt — opnieuw geladen.' })
      await load()
    }
  }

  // Build day cells for the month
  const monthDays = []
  for (let d = new Date(month); d.getMonth() === month.getMonth(); d.setDate(d.getDate() + 1)) {
    monthDays.push({ str: ymd(d), num: d.getDate(), wd: (d.getDay() + 6) % 7 })
  }
  const firstWd = monthDays[0]?.wd ?? 0

  const canPrev = month > addMonths(thisMonth, -4)
  const canNext = month < addMonths(thisMonth, 6)

  return (
    <>
      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>‹</button>
        <strong>{MONTHS[month.getMonth()]} {month.getFullYear()}</strong>
        <button className="icon-btn" onClick={() => canNext && setMonth(addMonths(month, 1))} disabled={!canNext}>›</button>
      </div>

      {monthIsPast && (
        <div className="hint" style={{ textAlign: 'center' }}>
          Deze maand is voorbij — alleen-lezen.
        </div>
      )}

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
      ) : (
        <>
          <div className="card">
            <div className="section-title">Ondernemers</div>
            {ondernemers.length === 0 ? (
              <div className="muted">Geen ondernemers gekoppeld aan deze winkel.</div>
            ) : (
              ondernemers.map((o) => (
                <div className="row-item" key={o.id}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{o.first_name}{o.last_name ? ' ' + o.last_name : ''}</strong>
                    {o.company_name && <span className="muted"> · {o.company_name}</span>}
                    {o.confirmed_at && <span className="tag bevestigd" style={{ marginLeft: 6 }}>bevestigd</span>}
                    {!o.submission_id && <span className="tag niet" style={{ marginLeft: 6 }}>nog niet doorgegeven</span>}
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      Verplicht ({o.mandatory.size}): {fmtList(o.mandatory) || '—'}
                      {' · '}Extra ({o.extra.size}): {fmtList(o.extra) || '—'}
                    </div>
                  </span>
                  <button
                    className="btn" style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => setEditing({ kind: 'ond', person: o })}
                  >
                    {monthIsPast ? 'Bekijken' : 'Bewerken'}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="section-title">Flexi's & jobstudenten</div>
            <div className="hint" style={{ marginTop: 0 }}>
              Iedereen die deze winkel als voorkeur opgaf voor {MONTHS[month.getMonth()]}.
            </div>
            {werkers.length === 0 ? (
              <div className="muted">Niemand gaf deze winkel als voorkeur op.</div>
            ) : (
              werkers.map((w) => (
                <div className="row-item" key={w.id}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{w.first_name}{w.last_name ? ' ' + w.last_name : ''}</strong>
                    <span className="muted"> · {w.role === 'flexi' ? 'Flexi' : 'Jobstudent'}</span>
                    {w.confirmed_at && <span className="tag bevestigd" style={{ marginLeft: 6 }}>bevestigd</span>}
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      Werkdagen ({w.work.size}): {fmtList(w.work) || '—'}
                      {' · '}voorkeur #{w.rank} · max {w.max}
                    </div>
                  </span>
                  <button
                    className="btn" style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => setEditing({ kind: 'werk', person: w })}
                  >
                    {monthIsPast ? 'Bekijken' : 'Bewerken'}
                  </button>
                </div>
              ))
            )}
          </div>

          {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}
        </>
      )}

      {editing && (
        <div style={ovl} onClick={() => setEditing(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>
              {editing.person.first_name}{editing.person.last_name ? ' ' + editing.person.last_name : ''}
            </h3>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
              {monthIsPast
                ? 'Alleen-lezen — deze maand is voorbij.'
                : editing.person.confirmed_at
                  ? 'Deze persoon heeft bevestigd. Wijzigingen overschrijven die.'
                  : 'Tik op een dag om die toe te voegen of weg te halen.'}
            </p>

            {editing.kind === 'ond' ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Verplichte dagen</div>
                <DayGrid
                  monthDays={monthDays} firstWd={firstWd} openSet={openSet}
                  selected={editing.person.mandatory}
                  altSelected={editing.person.extra}
                  color="ok" busy={busy} disabled={monthIsPast}
                  onTap={(d) => toggleDay('ond', editing.person, 'mandatory', d, editing.person.mandatory.has(d))}
                />
                <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>Extra dagen</div>
                <DayGrid
                  monthDays={monthDays} firstWd={firstWd} openSet={openSet}
                  selected={editing.person.extra}
                  altSelected={editing.person.mandatory}
                  color="paid" busy={busy} disabled={monthIsPast}
                  onTap={(d) => toggleDay('ond', editing.person, 'extra', d, editing.person.extra.has(d))}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Werkdagen</div>
                <DayGrid
                  monthDays={monthDays} firstWd={firstWd} openSet={openSet}
                  selected={editing.person.work}
                  color="paid" busy={busy} disabled={monthIsPast}
                  onTap={(d) => toggleDay('werk', editing.person, 'work', d, editing.person.work.has(d))}
                />
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => setEditing(null)}>Klaar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DayGrid({ monthDays, firstWd, openSet, selected, altSelected, color, busy, disabled, onTap }) {
  const cells = []
  for (let i = 0; i < firstWd; i++) cells.push(null)
  monthDays.forEach((d) => cells.push(d))
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ fontSize: 11, textAlign: 'center', color: 'var(--muted)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((c, i) => {
          if (c === null) return <div key={'b' + i} />
          const open = openSet.has(c.str)
          const isSel = selected.has(c.str)
          const isAlt = altSelected && altSelected.has(c.str)
          const bg = isSel ? (color === 'ok' ? '#cee5cc' : '#e8eef7')
                   : isAlt ? '#f0e6d6'
                   : open ? '#fff' : '#f3efe9'
          return (
            <button
              key={c.str}
              disabled={busy || disabled}
              onClick={() => onTap(c.str)}
              style={{
                padding: '8px 0', borderRadius: 6,
                border: '1px solid var(--line)',
                background: bg,
                color: open ? 'var(--ink)' : 'var(--muted)',
                fontSize: 13, fontWeight: isSel ? 700 : 400,
                cursor: disabled ? 'default' : 'pointer',
                opacity: open ? 1 : 0.6,
              }}
            >
              {c.num}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const ovl = {
  position: 'fixed', inset: 0, background: 'rgba(42, 37, 33, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50,
}
const dlg = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
  padding: 22, maxWidth: 420, width: '100%', boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
  maxHeight: '90vh', overflowY: 'auto',
}
