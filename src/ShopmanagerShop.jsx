import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog.jsx'

const WEEK = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
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
function t5(t) {
  return t ? t.slice(0, 5) : ''
}

export default function ShopmanagerShop({ employee, shopId }) {
  const today = new Date()
  const thisMonth = firstOfMonth(today)

  const [weekly, setWeekly] = useState({}) // weekday -> {is_open, open_time, close_time}
  const [firstSunday, setFirstSunday] = useState(false)
  const [month, setMonth] = useState(addMonths(thisMonth, 1))
  const [extra, setExtra] = useState([])
  const [newExtra, setNewExtra] = useState({ date: '', start: '10:00', end: '18:00' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {kind:'delExtra', id, label}

  const monthStart = ymd(firstOfMonth(month))
  const monthEnd = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))

  const loadSettings = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
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
    } finally {
      setLoading(false)
    }
  }, [shopId])

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
    loadExtra()
  }, [loadExtra])

  async function saveWeekday(wd, next) {
    setWeekly((prev) => ({ ...prev, [wd]: next }))
    setMsg(null)
    try {
      const { error } = await supabase.from('shop_weekly_defaults').upsert(
        {
          shop_id: shopId,
          weekday: wd,
          is_open: next.is_open,
          open_time: next.open_time,
          close_time: next.close_time,
        },
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
  function blurTime(wd) {
    saveWeekday(wd, weekly[wd])
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

  async function doGenerate() {
    // controleer dat open dagen geldige uren hebben
    for (let wd = 0; wd < 7; wd++) {
      const d = weekly[wd]
      if (d?.is_open && !(d.close_time > d.open_time)) {
        setMsg({ kind: 'err', text: `${WEEK[wd]}: het sluitingsuur moet na het openingsuur liggen.` })
        return
      }
    }
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.rpc('generate_shifts_for_month', { p_shop: shopId, p_month: monthStart })
      if (error) throw error
      setMsg({
        kind: 'good',
        text: `${data ?? 0} nieuwe ${data === 1 ? 'dag' : 'dagen'} aangemaakt voor ${MONTHS[month.getMonth()]}. Bestaande dagen blijven ongemoeid.`,
      })
    } catch (e) {
      setMsg({ kind: 'err', text: 'Genereren mislukt. Controleer de openingsuren.' })
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
        shop_id: shopId,
        shift_date: newExtra.date,
        kind: 'extra',
        start_time: newExtra.start,
        end_time: newExtra.end,
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

  const canPrev = month > addMonths(thisMonth, -1)
  const canNext = month < addMonths(thisMonth, 3)

  if (loading) {
    return <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
  }

  return (
    <>
      <div className="card">
        <div className="section-title">Vaste openingsdagen & uren</div>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Dit zijn de standaarddagen. Wijzigingen gelden voor maanden die je nadien genereert.
        </div>
        {WEEK.map((label, wd) => {
          const d = weekly[wd] || { is_open: false, open_time: '10:00', close_time: '18:00' }
          return (
            <div className="row-item" key={wd}>
              <span style={{ minWidth: 92 }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {d.is_open ? (
                  <>
                    <input
                      className="input"
                      type="time"
                      style={{ width: 96 }}
                      value={d.open_time}
                      onChange={(e) => changeTime(wd, 'open_time', e.target.value)}
                      onBlur={() => blurTime(wd)}
                    />
                    <span className="muted">–</span>
                    <input
                      className="input"
                      type="time"
                      style={{ width: 96 }}
                      value={d.close_time}
                      onChange={(e) => changeTime(wd, 'close_time', e.target.value)}
                      onBlur={() => blurTime(wd)}
                    />
                  </>
                ) : (
                  <span className="muted" style={{ marginRight: 4 }}>Gesloten</span>
                )}
                <button
                  className={'sw' + (d.is_open ? ' on' : '')}
                  onClick={() => toggleDay(wd)}
                  aria-label={label}
                >
                  <span className="knob" />
                </button>
              </div>
            </div>
          )
        })}
        <div className="row-item">
          <span>Open op de eerste zondag van de maand</span>
          <button className={'sw' + (firstSunday ? ' on' : '')} onClick={toggleFirstSunday} aria-label="Eerste zondag">
            <span className="knob" />
          </button>
        </div>
      </div>

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

      <div className="card">
        <div className="section-title">Openingsdagen aanmaken voor {MONTHS[month.getMonth()]}</div>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Maakt de gewone openingsdagen aan op basis van je vaste dagen hierboven. Al bestaande dagen worden niet
          overschreven, dus je kunt dit gerust opnieuw doen.
        </div>
        <button className="btn btn-primary btn-block" onClick={doGenerate} disabled={busy}>
          {busy ? 'Bezig…' : `Openingsdagen genereren voor ${MONTHS[month.getMonth()]}`}
        </button>
      </div>

      <div className="card">
        <div className="section-title">Extra shiften in {MONTHS[month.getMonth()]}</div>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Voor bijzondere dagen (bv. een feestdag of een extra openingsdag) bovenop de gewone planning.
        </div>
        {extra.length === 0 ? (
          <div className="muted" style={{ marginBottom: 10 }}>Nog geen extra shiften deze maand.</div>
        ) : (
          extra.map((s) => (
            <div className="row-item" key={s.id}>
              <span>
                {s.shift_date} · {t5(s.start_time)}–{t5(s.end_time)}
              </span>
              <button
                className="btn"
                style={{ padding: '5px 10px', fontSize: 13 }}
                onClick={() => setDialog({ kind: 'delExtra', id: s.id, label: `${s.shift_date} (${t5(s.start_time)}–${t5(s.end_time)})` })}
              >
                Verwijderen
              </button>
            </div>
          ))
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input
            className="input"
            type="date"
            value={newExtra.date}
            min={monthStart}
            max={monthEnd}
            onChange={(e) => setNewExtra({ ...newExtra, date: e.target.value })}
          />
          <input
            className="input"
            type="time"
            style={{ width: 96 }}
            value={newExtra.start}
            onChange={(e) => setNewExtra({ ...newExtra, start: e.target.value })}
          />
          <span className="muted">–</span>
          <input
            className="input"
            type="time"
            style={{ width: 96 }}
            value={newExtra.end}
            onChange={(e) => setNewExtra({ ...newExtra, end: e.target.value })}
          />
          <button className="btn btn-primary" onClick={addExtra} disabled={busy}>
            Toevoegen
          </button>
        </div>
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

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
