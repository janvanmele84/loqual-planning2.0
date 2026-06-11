import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

function dayLabel(iso) {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export default function UnplacedBanner({ shopId, monthStart }) {
  const [own, setOwn] = useState([])
  const [takeover, setTakeover] = useState([])

  const load = useCallback(async () => {
    if (!shopId || !monthStart) return

    const { data: ownRows } = await supabase
      .from('unplaced_per_shop_month')
      .select('*')
      .eq('shop_id', shopId)
      .eq('month_start', monthStart)
    setOwn(ownRows || [])

    const { data: tkRows } = await supabase
      .from('entrepreneur_available_for_takeover_month')
      .select('entrepreneur_id, home_shops_text, open_quota')
      .eq('month_start', monthStart)
    const ownEntrepreneurIds = new Set((ownRows || []).map((r) => r.entrepreneur_id))
    let takeoverList = (tkRows || []).filter((r) => !ownEntrepreneurIds.has(r.entrepreneur_id))

    if (takeoverList.length > 0) {
      const ids = takeoverList.map((r) => r.entrepreneur_id)
      const { data: emps } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .in('id', ids)
      const nameMap = {}
      ;(emps || []).forEach((e) => { nameMap[e.id] = e })

      const { data: subs } = await supabase
        .from('availability_submissions')
        .select('id, employee_id')
        .in('employee_id', ids)
        .eq('month_start', monthStart)
      const subMap = {}
      ;(subs || []).forEach((s) => { subMap[s.employee_id] = s.id })
      const subIds = Object.values(subMap)
      let avMap = {}
      if (subIds.length > 0) {
        const { data: avs } = await supabase
          .from('availability_days')
          .select('submission_id, day, kind')
          .in('submission_id', subIds)
          .in('kind', ['mandatory', 'extra'])
        ;(avs || []).forEach((a) => {
          const empId = Object.keys(subMap).find((k) => subMap[k] === a.submission_id)
          if (!empId) return
          if (!avMap[empId]) avMap[empId] = []
          avMap[empId].push(a.day)
        })
      }

      takeoverList = takeoverList.map((r) => ({
        ...r,
        first_name: nameMap[r.entrepreneur_id]?.first_name || 'Onbekend',
        last_name: nameMap[r.entrepreneur_id]?.last_name || '',
        available_days: (avMap[r.entrepreneur_id] || []).sort(),
      }))
    }
    setTakeover(takeoverList)
  }, [shopId, monthStart])

  useEffect(() => { load() }, [load])

  if (own.length === 0 && takeover.length === 0) return null

  return (
    <div style={{ marginBottom: 14 }}>
      {own.length > 0 && (
        <div style={banner('own')}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>
            ⚠ Nog niet ingepland in deze winkel ({own.length})
          </div>
          {own.map((r) => {
            const qt = r.quota_total || 0
            const mp = r.mandatory_planned || 0
            const bo = r.bought_out_days || 0
            const tot = mp + bo
            const status =
              qt === 0 ? null :
              tot >= qt ? 'done' :
              tot > 0   ? 'partial' :
                          'none'
            return (
              <div key={r.entrepreneur_id} style={{ fontSize: 13, marginBottom: 6, paddingBottom: 6, borderBottom: '1px dashed rgba(0,0,0,0.08)' }}>
                <div>
                  <strong>{r.first_name} {r.last_name || ''}</strong>
                  {r.company_name ? <span style={{ opacity: 0.8 }}> · {r.company_name}</span> : ''}
                  {status === 'done' && <span style={statusTag('green')}>✓ verplichte dagen voldaan</span>}
                  {status === 'partial' && <span style={statusTag('amber')}>{tot}/{qt} dagen ingepland</span>}
                  {status === 'none' && <span style={statusTag('red')}>{tot}/{qt} dagen ingepland</span>}
                </div>
                {status !== 'done' && qt > 0 && r.planned_shops_text && (
                  <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 2 }}>
                    Wel al ingepland in: {r.planned_shops_text}
                  </div>
                )}
                {status === 'done' && r.planned_shops_text && (
                  <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 2 }}>
                    Doet al haar verplichte dagen in: {r.planned_shops_text} — hier dus geen tekort
                  </div>
                )}
                {(status === 'partial' || status === 'none') && r.available_days && r.available_days.length > 0 && (
                  <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
                    Beschikbaar: {r.available_days.map(dayLabel).join(', ')}
                  </div>
                )}
                {qt === 0 && (
                  <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
                    Geen verplichte uitbatingsdagen — staat hier met standaardcommissie.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {takeover.length > 0 && (
        <div style={banner('takeover')}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>
            Beschikbaar voor overname uit andere winkels ({takeover.length})
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 8, opacity: 0.85 }}>
            Deze ondernemers zijn in geen enkele van hun eigen winkels ingepland. Als jij plaats hebt mag je
            hen op een lege dag aanduiden — kies in de picker de optie met label <em>Overname</em>. Wie wel al
            elders ingepland staat, verschijnt hier niet (geen "stelen" mogelijk).
          </div>
          {takeover.map((r) => (
            <div key={r.entrepreneur_id} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{r.first_name} {r.last_name || ''}</strong>
              <span style={{ opacity: 0.85 }}> · uit {r.home_shops_text}</span>
              {r.open_quota > 0 && <span style={{ opacity: 0.85 }}> · {r.open_quota} dag(en) open</span>}
              {r.available_days && r.available_days.length > 0 && (
                <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
                  Beschikbaar: {r.available_days.map(dayLabel).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const banner = (kind) => ({
  background: kind === 'takeover' ? '#fff7e8' : '#fde2e2',
  color: kind === 'takeover' ? '#8a571f' : '#8a1f1f',
  border: `1px solid ${kind === 'takeover' ? '#d88' : '#c33'}`,
  borderRadius: 12,
  padding: '10px 14px',
  marginBottom: 8,
  lineHeight: 1.4,
})

const statusTag = (color) => ({
  display: 'inline-block', marginLeft: 8, fontSize: 11, padding: '1px 8px', borderRadius: 8,
  fontWeight: 500,
  background:
    color === 'green' ? 'rgba(47, 90, 49, 0.15)' :
    color === 'amber' ? 'rgba(138, 87, 31, 0.15)' :
                        'rgba(138, 31, 31, 0.18)',
  color:
    color === 'green' ? '#2f5a31' :
    color === 'amber' ? '#8a571f' :
                        '#8a1f1f',
})
