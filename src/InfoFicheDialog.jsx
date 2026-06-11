import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}
function monthLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

export default function InfoFicheDialog({ employeeId, monthStart, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // Maand-navigatie binnen de dialoog (default = doorgegeven monthStart)
  const initial = monthStart
    ? new Date(monthStart)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [currentMonth, setCurrentMonth] = useState(initial)
  // Bereik: 2 maanden geleden tot 3 maanden vooruit (5 maanden + nu = 6)
  const today = new Date()
  const minMonth = new Date(today.getFullYear(), today.getMonth() - 2, 1)
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1)
  const canPrev = currentMonth > minMonth
  const canNext = currentMonth < maxMonth

  const load = useCallback(async () => {
    setError(null)
    setData(null)
    try {
      const { data: result, error: err } = await supabase.rpc('entrepreneur_info_sheet', {
        p_employee_id: employeeId, p_month: ymd(currentMonth),
      })
      if (err) throw err
      setData(result)
    } catch (e) {
      setError(e?.message || String(e))
    }
  }, [employeeId, currentMonth])

  useEffect(() => { load() }, [load])

  function shiftMonth(diff) {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + diff, 1))
  }

  if (!employeeId) return null

  return (
    <div style={overlay} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>
            {data?.employee?.first_name || ''} {data?.employee?.last_name || ''}
          </h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        {data?.employee?.company_name && (
          <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>{data.employee.company_name}</div>
        )}
        <div className="monthnav" style={{ marginBottom: 14 }}>
          <button className="icon-btn" onClick={() => shiftMonth(-1)} disabled={!canPrev}>‹</button>
          <span className="label">{monthLabel(ymd(currentMonth))}</span>
          <button className="icon-btn" onClick={() => shiftMonth(1)} disabled={!canNext}>›</button>
        </div>

        {!data ? (
          error ? <p className="muted">Fout: {error}</p> : <p className="muted">Laden…</p>
        ) : (
          <>
            {/* Submission status */}
            <div style={card}>
              <div style={cardTitle}>Beschikbaarheden doorgegeven</div>
              {data.submission ? (
                <>
                  <div style={{ fontSize: 13 }}>
                    <strong>{(data.submission.mandatory_days || []).length}</strong> verplichte dagen aangevinkt
                    {(data.submission.extra_days || []).length > 0 &&
                      <> · <strong>{data.submission.extra_days.length}</strong> extra dagen aangevinkt</>}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Status: {data.submission.confirmed_at
                      ? <span style={tag('green')}>Bevestigd</span>
                      : <span style={tag('red')}>Niet bevestigd</span>}
                  </div>
                  {(data.submission.mandatory_days || []).length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Verplichte dagen: {data.submission.mandatory_days.map(fmt).join(', ')}
                    </div>
                  )}
                  {(data.submission.extra_days || []).length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Extra dagen: {data.submission.extra_days.map(fmt).join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>Niets doorgegeven voor deze maand.</div>
              )}
            </div>

            {/* Per winkel */}
            {(data.per_shop || []).length > 0 && (
              <div style={card}>
                <div style={cardTitle}>Per winkel</div>
                {data.per_shop.map((s) => {
                  const credited = (s.regular_done || 0) + (s.makeup_in || 0)
                  const buyoutDays = s.buyout?.days_count || 0
                  const totalForQuota = credited + buyoutDays + (s.buyout?.reason === 'shifted' ? (s.buyout?.days_count || s.quota) : 0)
                  return (
                    <div key={s.shop_id} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                      <div style={{ fontWeight: 600 }}>
                        {s.shop_name}
                        {!s.must_operate && <span style={tag('gray')}>standaardcommissie</span>}
                      </div>
                      {s.must_operate && (
                        <div style={{ fontSize: 13, marginTop: 4 }}>
                          Quota: <strong>{s.quota}</strong> · gepresteerd: <strong>{s.regular_done}</strong>
                          {s.makeup_in > 0 && <> · inhaal: <strong>{s.makeup_in}</strong></>}
                          {s.buyout && <> · afgekocht: <strong>{s.buyout.days_count}</strong></>}
                          {s.extra_done > 0 && <> · extra: <strong>{s.extra_done}</strong></>}
                        </div>
                      )}
                      {(s.regular_dates || []).length > 0 && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          Ingepland op: {s.regular_dates.map(fmt).join(', ')}
                        </div>
                      )}
                      {s.buyout && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {s.buyout.reason === 'paid' && `Afgekocht (€${s.buyout.amount || 200} per dag)`}
                          {s.buyout.reason === 'auto_unconfirmed' && 'Automatisch afgekocht (geen bevestiging)'}
                          {s.buyout.reason === 'shifted' && `Verschoven naar ${monthLabel(s.buyout.shift_to_month)}`}
                          {s.buyout.reason === 'other' && 'Andere afhandeling'}
                        </div>
                      )}
                      {/* Afwijking-detectie */}
                      {s.must_operate && (() => {
                        const tot = (s.regular_done || 0) + (s.makeup_in || 0) + (s.buyout?.days_count || 0)
                        if (tot < s.quota) return <div style={{ fontSize: 12, color: '#c33', marginTop: 4 }}>⚠ {s.quota - tot} dag(en) tekort in deze winkel</div>
                        if (tot > s.quota) return <div style={{ fontSize: 12, color: '#8a571f', marginTop: 4 }}>⚠ {tot - s.quota} dag(en) boven quota</div>
                        return null
                      })()}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Totalen */}
            {data.totals && (
              <div style={card}>
                <div style={cardTitle}>Totalen over alle winkels</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  Ingeplande dagen deze maand: <strong>{data.totals.total_assignments}</strong><br/>
                  Verplichte dagen ingepland: <strong>{data.totals.mandatory_assignments}</strong><br/>
                  Betaalde extra/flexi dagen: <strong>{data.totals.extra_assignments}</strong><br/>
                  Handmatig vastgezet door manager: <strong>{data.totals.manual_assignments}</strong><br/>
                  {data.totals.makeup_in_count > 0 && (<>Inhaaldagen voor deze maand: <strong>{data.totals.makeup_in_count}</strong><br/></>)}
                  {data.totals.shifted_out_count > 0 && (<>Verschoven naar andere maand(en): <strong>{data.totals.shifted_out_count}</strong><br/></>)}
                  Totaal afgekochte dagen: <strong>{data.totals.bought_out_days}</strong>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, zIndex: 1000,
}
const dialog = {
  background: 'var(--surface, #fff)', borderRadius: 14, padding: 18,
  maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto',
}
const card = { background: 'var(--surface-2, #faf8f5)', borderRadius: 10, padding: 12, marginBottom: 12 }
const cardTitle = { fontWeight: 600, marginBottom: 8 }
const closeBtn = { background: 'transparent', border: 0, fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }

const tag = (color) => ({
  display: 'inline-block', marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 8,
  background: color === 'green' ? '#e8efe4' : color === 'red' ? '#fde2e2' : '#eee',
  color: color === 'green' ? '#2f5a31' : color === 'red' ? '#8a1f1f' : '#666',
})
