import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function dayLabel(iso) {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export default function UnplacedBanner({ shopId, monthStart }) {
  const [own, setOwn] = useState([])     // ondernemers niet ingepland in deze winkel
  const [others, setOthers] = useState([]) // ondernemers niet ingepland in andere winkels
  const [shopsMap, setShopsMap] = useState({})

  const load = useCallback(async () => {
    if (!shopId || !monthStart) return
    const { data: shops } = await supabase.from('shops').select('id, name').eq('active', true)
    const sm = {}
    ;(shops || []).forEach((s) => (sm[s.id] = s.name))
    setShopsMap(sm)

    const { data } = await supabase
      .from('unplaced_per_shop_month')
      .select('*')
      .eq('month_start', monthStart)
    const rows = data || []
    setOwn(rows.filter((r) => r.shop_id === shopId))
    setOthers(rows.filter((r) => r.shop_id !== shopId))
  }, [shopId, monthStart])

  useEffect(() => { load() }, [load])

  if (own.length === 0 && others.length === 0) return null

  return (
    <div style={{ marginBottom: 14 }}>
      {own.length > 0 && (
        <div style={banner(false)}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>
            ⚠ Nog niet ingepland in deze winkel ({own.length}):
          </div>
          {own.map((r) => (
            <div key={r.entrepreneur_id} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{r.first_name} {r.last_name || ''}</strong>
              {r.company_name ? ` · ${r.company_name}` : ''}
              {r.available_days && r.available_days.length > 0
                ? ` · beschikbaar: ${r.available_days.map(dayLabel).join(', ')}`
                : ' · geen beschikbaarheden doorgegeven'}
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div style={banner(true)}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>
            Nog niet ingepland in andere winkels ({others.length}):
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 6, opacity: 0.85 }}>
            Misschien kan jij hen hier opvangen? Tik op een lege dag in de kalender en kies dan deze persoon.
          </div>
          {others.map((r) => (
            <div key={r.entrepreneur_id + r.shop_id} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{r.first_name}</strong>
              {' '}({shopsMap[r.shop_id] || 'andere winkel'})
              {r.available_days && r.available_days.length > 0
                ? ` · beschikbaar: ${r.available_days.map(dayLabel).join(', ')}`
                : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const banner = (isOthers) => ({
  background: isOthers ? '#fff7e8' : '#fde2e2',
  color: isOthers ? '#8a571f' : '#8a1f1f',
  border: `1px solid ${isOthers ? '#d88' : '#c33'}`,
  borderRadius: 12,
  padding: '10px 14px',
  marginBottom: 8,
  lineHeight: 1.4,
})
