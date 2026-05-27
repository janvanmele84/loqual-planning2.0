import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Shell from './Shell.jsx'
import ShopmanagerPlanning from './ShopmanagerPlanning.jsx'
import ShopmanagerShop from './ShopmanagerShop.jsx'
import ShopmanagerPeople from './ShopmanagerPeople.jsx'

export default function ShopmanagerHome({ employee, onLogout }) {
  const [managedShops, setManagedShops] = useState([])
  const [shopsMap, setShopsMap] = useState({})
  const [shopId, setShopId] = useState(null)
  const [tab, setTab] = useState('planning') // 'planning' | 'winkel'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: allShops } = await supabase.from('shops').select('id, name')
      const map = {}
      ;(allShops || []).forEach((s) => (map[s.id] = s.name))

      const { data: ms } = await supabase
        .from('shopmanager_shops')
        .select('shop_id')
        .eq('manager_id', employee.id)
      const managed = (ms || []).map((r) => ({ id: r.shop_id, name: map[r.shop_id] || 'Winkel' }))

      if (!active) return
      setShopsMap(map)
      setManagedShops(managed)
      setShopId(managed[0]?.id || null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [employee.id])

  if (loading) {
    return (
      <Shell employee={employee} onLogout={onLogout}>
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
      </Shell>
    )
  }

  if (managedShops.length === 0) {
    return (
      <Shell employee={employee} onLogout={onLogout}>
        <div className="card" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <h2 style={{ marginBottom: 8 }}>Nog geen winkel</h2>
          <p className="muted">Er is nog geen winkel aan jou gekoppeld als shopmanager. Vraag de admin om je toe te wijzen.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell employee={employee} onLogout={onLogout}>
      {managedShops.length > 1 && (
        <div className="pills">
          {managedShops.map((s) => (
            <button
              key={s.id}
              className={'pill' + (s.id === shopId ? ' active' : '')}
              onClick={() => setShopId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {managedShops.length === 1 && (
        <div className="section-title" style={{ marginBottom: 12 }}>
          {managedShops[0].name}
        </div>
      )}

      <div className="tabs">
        <button className={'tab' + (tab === 'planning' ? ' active' : '')} onClick={() => setTab('planning')}>
          Planning
        </button>
        <button className={'tab' + (tab === 'winkel' ? ' active' : '')} onClick={() => setTab('winkel')}>
          Winkel
        </button>
        <button className={'tab' + (tab === 'mensen' ? ' active' : '')} onClick={() => setTab('mensen')}>
          Mensen
        </button>
      </div>

      {tab === 'planning' ? (
        <ShopmanagerPlanning key={'p-' + shopId} employee={employee} shopId={shopId} shopsMap={shopsMap} />
      ) : tab === 'winkel' ? (
        <ShopmanagerShop key={'w-' + shopId} employee={employee} shopId={shopId} />
      ) : (
        <ShopmanagerPeople key={'m-' + shopId} shopId={shopId} />
      )}
    </Shell>
  )
}
