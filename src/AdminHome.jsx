import { useState } from 'react'
import Shell from './Shell.jsx'
import AdminShops from './AdminShops.jsx'
import AdminManagers from './AdminManagers.jsx'

export default function AdminHome({ employee, onLogout }) {
  const [tab, setTab] = useState('winkels')

  return (
    <Shell employee={employee} onLogout={onLogout}>
      <div className="section-title" style={{ marginBottom: 12 }}>Beheer</div>

      <div className="tabs">
        <button className={'tab' + (tab === 'winkels' ? ' active' : '')} onClick={() => setTab('winkels')}>
          Winkels
        </button>
        <button className={'tab' + (tab === 'managers' ? ' active' : '')} onClick={() => setTab('managers')}>
          Managers
        </button>
      </div>

      {tab === 'winkels' ? <AdminShops /> : <AdminManagers />}
    </Shell>
  )
}
