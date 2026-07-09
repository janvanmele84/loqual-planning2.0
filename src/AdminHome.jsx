import { useState } from 'react'
import Shell from './Shell.jsx'
import AdminPlanning from './AdminPlanning.jsx'
import AdminShops from './AdminShops.jsx'
import AdminManagers from './AdminManagers.jsx'
import AdminAccounts from './AdminAccounts.jsx'
import AdminImport from './AdminImport.jsx'
import BonusOverview from './BonusOverview.jsx'
import AdminExtraBuyout from './AdminExtraBuyout.jsx'
import AdminMailSettings from './AdminMailSettings.jsx'
import AdminReleases from './AdminReleases.jsx'
import AdminOverviews from './AdminOverviews.jsx'

export default function AdminHome({ employee, onLogout }) {
  const [tab, setTab] = useState('planning')

  return (
    <Shell employee={employee} onLogout={onLogout}>
      <div className="section-title" style={{ marginBottom: 12 }}>Beheer</div>

      <div className="tabs">
        <button className={'tab' + (tab === 'planning' ? ' active' : '')} onClick={() => setTab('planning')}>
          Planning
        </button>
        <button className={'tab' + (tab === 'winkels' ? ' active' : '')} onClick={() => setTab('winkels')}>
          Winkels
        </button>
        <button className={'tab' + (tab === 'managers' ? ' active' : '')} onClick={() => setTab('managers')}>
          Managers
        </button>
        <button className={'tab' + (tab === 'accounts' ? ' active' : '')} onClick={() => setTab('accounts')}>
          Accounts
        </button>
        <button className={'tab' + (tab === 'import' ? ' active' : '')} onClick={() => setTab('import')}>
          Import
        </button>
        <button className={'tab' + (tab === 'bonus' ? ' active' : '')} onClick={() => setTab('bonus')}>
          Bonus
        </button>
        <button className={'tab' + (tab === 'extra' ? ' active' : '')} onClick={() => setTab('extra')}>
          Extra & afkoop
        </button>
        <button className={'tab' + (tab === 'mailsys' ? ' active' : '')} onClick={() => setTab('mailsys')}>
          Mail-systeem
        </button>
        <button className={'tab' + (tab === 'releases' ? ' active' : '')} onClick={() => setTab('releases')}>
          Vrijgaves
        </button>
        <button className={'tab' + (tab === 'overzichten' ? ' active' : '')} onClick={() => setTab('overzichten')}>
          Overzichten
        </button>
      </div>

      {tab === 'planning' ? <AdminPlanning />
        : tab === 'winkels' ? <AdminShops />
        : tab === 'managers' ? <AdminManagers />
        : tab === 'accounts' ? <AdminAccounts employee={employee} />
        : tab === 'import' ? <AdminImport />
        : tab === 'bonus' ? <BonusOverview filterManagerId={null} />
        : tab === 'extra' ? <AdminExtraBuyout />
        : tab === 'releases' ? <AdminReleases />
        : tab === 'overzichten' ? <AdminOverviews />
        : <AdminMailSettings />}
    </Shell>
  )
}
