import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog.jsx'

const DAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
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
function t5(t) {
  return t ? t.slice(0, 5) : ''
}
function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function ShopmanagerShop({ shopId }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [weekly, setWeekly] = useState({})
  const [firstSunday, setFirstSunday] = useState(false)
  const [showStandard, setShowStandard] = useState(false)
  const [month, setMonth] = useState(addMonths(thisMonth, 1))
  const [dayShifts, setDayShifts] = useState({}) // date -> {id, start, end}
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editor, setEditor] = useState(null) // null | {date, open, start, end, shiftId}
  const [extra, setExtra] = useState([])
  const [newExtra, setNewExtra] = useState({ date: '', start: '10:00', end: '18:00' })
  const [dialog, setDialog] = useState(null) // null | {kind:'delExtra', id, label}
  const [released, setReleased] = useState(false)

  const monthStart = ymd(firstOfMonth(month))
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))

  const loadSettings = useCallback(async () => {
    if (!shopId) return
    try {
      const { data: wd } = await supabase
        .from('shop_weekly_defaults')
        .select('weekday, is_open, open_time, close_time')
        .eq('shop_id', shopId)
      const map = {}
      for (let i = 0; i < 7; i++) map[i] = { is_open: false, open_time: '10:00', close_time: '18:00' }
      ;(wd || []).forEach((r) => {
        map[r.weekday] = {
          is_open: r.is_open,
          open_time: t5(r.open_time) || '10:00',
          close_time: t5(r.close_time) || '18:00',
        }
      })
      setWeekly(map)
      const { data: shop } = await supabase.from('shops').select('open_first_sunday').eq('id', shopId).maybeSingle()
      setFirstSunday(!!shop?.open_first_sunday)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Instellingen laden mislukt.' })
    }
  }, [shopId])

  const loadMonth = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('shifts')
        .select('id, shift_date, start_time, end_time')
        .eq('shop_id', shopId)
        .eq('kind', 'standard')
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
      const map = {}
      ;(data || []).forEach((s) => {
        map[s.shift_date] = { id: s.id, start: t5(s.start_time), end: t5(s.end_time) }
      })
      setDayShifts(map)

      const { data: rel } = await supabase
        .from('shop_availability_release')
        .select('shop_id')
        .eq('shop_id', shopId)
        .eq('month_start', monthStart)
        .maybeSingle()
      setReleased(!!rel)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Kalender laden mislukt.' })
    } finally {
      setLoading(false)
    }
  }, [shopId, monthStart, monthEnd])

  const loadExtra = useCallback(async () => {
    if (!shopId) return
    const { data } = await supabase
      .from('shifts')
      .select('id, shift_date, start_time, end_time')
      .eq('shop_id', shopId)
      .eq('kind', 'extra')
      .gte('shift_date', monthStart)
      .lte('shift_date', monthEnd)
      .order('shift_date')
    setExtra(data || [])
  }, [shopId, monthStart, monthEnd])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])
  useEffect(() => {
    loadMonth()
  }, [loadMonth])
  useEffect(() => {
    loadExtra()
  }, [loadExtra])

  // ---- standaard uurrooster ----
  async function saveWeekday(wd, next) {
    setWeekly((prev) => ({ ...prev, [wd]: next }))
    setMsg(null)
    try {
      const { error } = await supabase.from('shop_weekly_defaults').upsert(
        { shop_id: shopId, weekday: wd, is_open: next.is_open, open_time: next.open_time, close_time: next.close_time },
        { onConflict: 'shop_id,weekday' },
      )
      if (error) throw error
    } catch (e) {
      setMsg({ kind: 'err', text: 'Opslaan mislukt.' })
    }
  }
  function toggleDay(wd) {
    const cur = weekly[wd]
    saveWeekday(wd, { ...cur, is_open: !cur.is_open })
  }
  function changeTime(wd, field, value) {
    setWeekly((prev) => ({ ...prev, [wd]: { ...prev[wd], [field]: value } }))
  }
  async function toggleFirstSunday() {
    const v = !firstSunday
    setFirstSunday(v)
    try {
      const { error } = await supabase.rpc('set_shop_open_first_sunday', { p_shop: shopId, p_value: v })
      if (error) throw error
    } catch (e) {
      setFirstSunday(!v)
      setMsg({ kind: 'err', text: 'Opslaan mislukt.' })
    }
  }

  // ---- standaardrooster toepassen op de maand ----
  async function applyStandard() {
    for (let wd = 0; wd < 7; wd++) {
      const d = weekly[wd]
      if (d?.is_open && !(d.close_time > d.open_time)) {
        setMsg({ kind: 'err', text: `${DAYS[wd]}: het sluitingsuur moet na het openingsuur liggen.` })
        return
      }
    }
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.rpc('generate_shifts_for_month', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      await loadMonth()
      setMsg({
        kind: 'good',
        text: `${data ?? 0} nieuwe ${data === 1 ? 'dag' : 'dagen'} toegevoegd. Reeds ingestelde dagen bleven ongemoeid.`,
      })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Toepassen mislukt. Controleer de openingsuren.' })
    } finally {
      setBusy(false)
    }
  }

  // ---- individuele dag ----
  function openEditor(dateStr) {
    const existing = dayShifts[dateStr]
    const wd = (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7
    const def = weekly[wd] || { open_time: '10:00', close_time: '18:00' }
    setEditor({
      date: dateStr,
      open: !!existing,
      start: existing ? existing.start : def.open_time,
      end: existing ? existing.end : def.close_time,
      shiftId: existing ? existing.id : null,
    })
  }

  async function saveDay() {
    const e = editor
    if (!e) return
    if (e.open && !(e.end > e.start)) {
      setMsg({ kind: 'err', text: 'Het sluitingsuur moet na het openingsuur liggen.' })
      return
    }
    setEditor(null)
    setBusy(true)
    setMsg(null)
    try {
      if (e.open && e.shiftId) {
        const { error } = await supabase
          .from('shifts')
          .update({ start_time: e.start, end_time: e.end })
          .eq('id', e.shiftId)
        if (error) throw error
      } else if (e.open && !e.shiftId) {
        const { error } = await supabase
          .from('shifts')
          .insert({ shop_id: shopId, shift_date: e.date, kind: 'standard', start_time: e.start, end_time: e.end })
        if (error) throw error
      } else if (!e.open && e.shiftId) {
        const { error } = await supabase.from('shifts').delete().eq('id', e.shiftId)
        if (error) throw error
      }
      await loadMonth()
    } catch (e2) {
      setMsg({ kind: 'err', text: 'Opslaan mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function addExtra() {
    if (!newExtra.date) {
      setMsg({ kind: 'err', text: 'Kies een datum voor de extra shift.' })
      return
    }
    if (!(newExtra.end > newExtra.start)) {
      setMsg({ kind: 'err', text: 'Het einduur moet na het beginuur liggen.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await supabase.from('shifts').insert({
        shop_id: shopId, shift_date: newExtra.date, kind: 'extra',
        start_time: newExtra.start, end_time: newExtra.end,
      })
      if (error) throw error
      setNewExtra({ date: '', start: '10:00', end: '18:00' })
      await loadExtra()
      setMsg({ kind: 'good', text: 'Extra shift toegevoegd.' })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Toevoegen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doDeleteExtra() {
    const d = dialog
    setDialog(null)
    if (!d?.id) return
    setBusy(true)
    try {
      const { error } = await supabase.from('shifts').delete().eq('id', d.id)
      if (error) throw error
      await loadExtra()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Verwijderen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doRelease() {
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('release_availability', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      setReleased(true)
      setMsg({ kind: 'good', text: `${MONTHS[month.getMonth()]} vrijgegeven — medewerkers kunnen nu invullen.` })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Vrijgeven mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doUnrelease() {
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('unrelease_availability', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      setReleased(false)
      setMsg({ kind: 'good', text: `Vrijgave voor ${MONTHS[month.getMonth()]} ingetrokken.` })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Intrekken mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  const canPrev = month > addMonths(thisMonth, -1)
  const canNext = month < addMonths(thisMonth, 6)

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const blanks = leadingBlanks(month)
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(month.getFullYear(), month.getMonth(), d)
    cells.push({ d, str: ymd(dateObj), isToday: ymd(dateObj) === ymd(today) })
  }
  const extraDates = new Set(extra.map((s) => s.shift_date))

  return (
    <>
      <div className="card">
        <button
          onClick={() => setShowStandard((s) => !s)}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
        >
          <span className="section-title" style={{ margin: 0 }}>Standaard uurrooster</span>
          <span className="muted">{showStandard ? 'verbergen ▲' : 'tonen ▼'}</span>
        </button>

        {showStandard && (
          <div style={{ marginTop: 12 }}>
            <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Stel je vaste week in. Dit pas je hieronder met één klik toe op een hele maand.
            </div>
            {DAYS.map((label, wd) => {
              const d = weekly[wd] || { is_open: false, open_time: '10:00', close_time: '18:00' }
              return (
                <div className="row-item" key={wd}>
                  <span style={{ minWidth: 92 }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {d.is_open ? (
                      <>
                        <input className="input" type="time" style={{ width: 92 }} value={d.open_time}
                          onChange={(ev) => changeTime(wd, 'open_time', ev.target.value)} onBlur={() => saveWeekday(wd, weekly[wd])} />
                        <span className="muted">–</span>
                        <input className="input" type="time" style={{ width: 92 }} value={d.close_time}
                          onChange={(ev) => changeTime(wd, 'close_time', ev.target.value)} onBlur={() => saveWeekday(wd, weekly[wd])} />
                      </>
                    ) : (
                      <span className="muted" style={{ marginRight: 4 }}>Gesloten</span>
                    )}
                    <button className={'sw' + (d.is_open ? ' on' : '')} onClick={() => toggleDay(wd)} aria-label={label}>
                      <span className="knob" />
                    </button>
                  </div>
                </div>
              )
            })}
            <div className="row-item">
              <span>Open op de eerste zondag</span>
              <button className={'sw' + (firstSunday ? ' on' : '')} onClick={toggleFirstSunday} aria-label="Eerste zondag">
                <span className="knob" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="monthnav">
        <button className="icon-btn" onClick={() => canPrev && setMonth(addMonths(month, -1))} disabled={!canPrev}>‹</button>
        <span className="label">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <button className="icon-btn" onClick={() => canNext && setMonth(addMonths(month, 1))} disabled={!canNext}>›</button>
      </div>

      <button className="btn btn-primary btn-block" onClick={applyStandard} disabled={busy} style={{ marginBottom: 8 }}>
        {busy ? 'Bezig…' : `Standaardrooster toepassen op ${MONTHS[month.getMonth()]}`}
      </button>
      <div className="hint" style={{ textAlign: 'center', marginTop: 0 }}>
        Doe dit eerst; pas daarna individuele dagen aan. Opnieuw toepassen voegt enkel ontbrekende dagen toe.
      </div>

      <div className="card">
        <div className="section-title" style={{ marginBottom: 8 }}>Beschikbaarheden vrijgeven</div>
        {released ? (
          <div>
            <span className="pubbadge published">Vrijgegeven</span>
            <div className="hint" style={{ marginBottom: 10 }}>
              Medewerkers kunnen hun beschikbaarheid voor {MONTHS[month.getMonth()]} {month.getFullYear()} ingeven.
            </div>
            <button className="btn" onClick={doUnrelease} disabled={busy}>Vrijgave intrekken</button>
          </div>
        ) : (
          <div>
            <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Zolang je niet vrijgeeft, kunnen medewerkers deze maand niet invullen. Geef vrij zodra de openingsdagen kloppen.
            </div>
            <button className="btn btn-primary btn-block" onClick={doRelease} disabled={busy}>
              Openingsdagen vrijgeven voor {MONTHS[month.getMonth()]}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
      ) : (
        <div className="card">
          <div className="weekhead">
            {WEEK.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="pgrid">
            {cells.map((c, i) => {
              if (c === null) return <div key={`b${i}`} className="pcell blank" />
              const s = dayShifts[c.str]
              const cls = 'pcell' + (s ? ' ok' : ' closed') + (c.isToday ? ' today' : '')
              return (
                <div key={c.str} className={cls} style={{ cursor: 'pointer' }} onClick={() => openEditor(c.str)}>
                  <span className="num">{c.d}</span>
                  <span className="nm" style={{ fontWeight: 500 }}>
                    {s ? `${s.start}–${s.end}` : 'gesloten'}
                  </span>
                  {extraDates.has(c.str) && <span className="mark" title="Extra shift">+</span>}
                </div>
              )
            })}
          </div>
          <div className="legend">
            <span className="item"><span className="sw" style={{ background: 'var(--avail-bg)' }} /> Open</span>
            <span className="item"><span className="sw" style={{ background: 'var(--surface-2)' }} /> Gesloten</span>
            <span className="item">Tik een dag aan om aan te passen</span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title">Extra shiften in {MONTHS[month.getMonth()]}</div>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Een tweede shift bovenop de gewone openingsdag (bv. extra hulp of een speciale dag). Dagen met een extra
          shift krijgen een <strong>+</strong> in de kalender.
        </div>
        {extra.length === 0 ? (
          <div className="muted" style={{ marginBottom: 10 }}>Nog geen extra shiften deze maand.</div>
        ) : (
          extra.map((s) => (
            <div className="row-item" key={s.id}>
              <span>{fmtDate(s.shift_date)} · {t5(s.start_time)}–{t5(s.end_time)}</span>
              <button
                className="btn"
                style={{ padding: '5px 10px', fontSize: 13 }}
                onClick={() => setDialog({ kind: 'delExtra', id: s.id, label: `${fmtDate(s.shift_date)} (${t5(s.start_time)}–${t5(s.end_time)})` })}
              >
                Verwijderen
              </button>
            </div>
          ))
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input className="input" type="date" value={newExtra.date} min={monthStart} max={monthEnd}
            onChange={(e) => setNewExtra({ ...newExtra, date: e.target.value })} />
          <input className="input" type="time" style={{ width: 92 }} value={newExtra.start}
            onChange={(e) => setNewExtra({ ...newExtra, start: e.target.value })} />
          <span className="muted">–</span>
          <input className="input" type="time" style={{ width: 92 }} value={newExtra.end}
            onChange={(e) => setNewExtra({ ...newExtra, end: e.target.value })} />
          <button className="btn btn-primary" onClick={addExtra} disabled={busy}>Toevoegen</button>
        </div>
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

      {editor && (
        <div style={ovl} onClick={() => setEditor(null)}>
          <div style={dlg} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>Dag aanpassen</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>{fmtDate(editor.date)}</p>

            <div className="row-item" style={{ borderTop: 'none' }}>
              <span>{editor.open ? 'Open' : 'Gesloten'}</span>
              <button
                className={'sw' + (editor.open ? ' on' : '')}
                onClick={() => setEditor({ ...editor, open: !editor.open })}
                aria-label="Open of gesloten"
              >
                <span className="knob" />
              </button>
            </div>

            {editor.open && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input className="input" type="time" style={{ width: 100 }} value={editor.start}
                  onChange={(e) => setEditor({ ...editor, start: e.target.value })} />
                <span className="muted">–</span>
                <input className="input" type="time" style={{ width: 100 }} value={editor.end}
                  onChange={(e) => setEditor({ ...editor, end: e.target.value })} />
              </div>
            )}

            {!editor.open && editor.shiftId && (
              <p style={{ color: 'var(--danger)', fontSize: 13, margin: '4px 0 12px' }}>
                Let op: sluiten verwijdert deze dag, inclusief een eventueel ingeplande persoon.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn" onClick={() => setEditor(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={saveDay}>Opslaan</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title="Extra shift verwijderen?"
        message={`Wil je de extra shift van ${dialog?.label || 'deze dag'} verwijderen?`}
        confirmLabel="Ja, verwijderen"
        onConfirm={doDeleteExtra}
        onCancel={() => setDialog(null)}
      />
    </>
  )
}

const ovl = {
  position: 'fixed', inset: 0, background: 'rgba(42, 37, 33, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50,
}
const dlg = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
  padding: '22px', maxWidth: 360, width: '100%', boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
}
