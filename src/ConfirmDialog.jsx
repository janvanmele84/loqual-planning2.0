export default function ConfirmDialog({
  open,
  title = 'Ben je zeker?',
  message,
  confirmLabel = 'Ja, bevestigen',
  cancelLabel = 'Annuleren',
  onConfirm,
  onCancel,
}) {
  if (!open) return null
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 8 }}>{title}</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(42, 37, 33, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 50,
}
const dialog = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 16,
  padding: '22px',
  maxWidth: 380,
  width: '100%',
  boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
}
