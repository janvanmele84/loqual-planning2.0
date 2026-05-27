const ROLE_LABEL = {
  ondernemer: 'ondernemer',
  flexi: 'flexi',
  jobstudent: 'jobstudent',
  shopmanager: 'shopmanager',
  admin: 'admin',
}

export default function Shell({ employee, onLogout, children }) {
  return (
    <div>
      <header className="topbar">
        <div className="wordmark">
          Loqual<span className="dot">.</span>
        </div>
        <div className="who">
          {employee && (
            <>
              <span className="who-name">{employee.first_name}</span>
              <span className="who-role">{ROLE_LABEL[employee.role] || employee.role}</span>
            </>
          )}
          <button className="btn btn-ghost" onClick={onLogout}>
            Afmelden
          </button>
        </div>
      </header>
      <main className="shell">{children}</main>
    </div>
  )
}
