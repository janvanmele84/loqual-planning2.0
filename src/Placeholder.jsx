import Shell from './Shell.jsx'

const NEXT = {
  flexi: 'Hier komt je scherm om werkdagen en winkelvoorkeuren door te geven.',
  jobstudent: 'Hier komt je scherm om werkdagen en winkelvoorkeuren door te geven.',
  shopmanager: 'Hier komt je planningskalender met de shuffle-knop en het invullen van lege dagen.',
  admin: 'Hier komt je beheerscherm: winkels, medewerkers, publiceren en de mailteksten.',
}

export default function Placeholder({ employee, onLogout }) {
  return (
    <Shell employee={employee} onLogout={onLogout}>
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div className="placeholder-art">✳</div>
        <h2 style={{ marginBottom: 8 }}>Dag {employee.first_name}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {NEXT[employee.role] || 'Dit scherm is nog in opbouw.'}
        </p>
      </div>
    </Shell>
  )
}
