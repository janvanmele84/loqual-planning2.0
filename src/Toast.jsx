import { useEffect } from 'react'

export default function Toast({ msg, onClose, duration = 6000 }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [msg, onClose, duration])

  if (!msg) return null
  const isErr = msg.kind === 'err'
  return (
    <div
      role="status"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: isErr ? '#fde2e2' : '#e8efe4',
        color: isErr ? '#8a1f1f' : '#2f5a31',
        border: '1px solid currentColor',
        padding: '12px 18px',
        borderRadius: 12,
        maxWidth: 'min(600px, 92vw)',
        zIndex: 1000,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
        fontSize: 14,
        lineHeight: 1.45,
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      {msg.text}
    </div>
  )
}
