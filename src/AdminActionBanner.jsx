import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function monthLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const KIND_LABELS = {
  release_announcement: {
    title: 'Stuur vrijgave-bericht',
    detail: (shop, month) => `${shop} – ${monthLabel(month)} is vrijgegeven. Mail naar de medewerkers van deze winkel dat ze hun beschikbaarheden mogen doorgeven.`,
  },
  publish_announcement: {
    title: 'Stuur publicatie-bericht',
    detail: (shop, month) => `${shop} – planning voor ${monthLabel(month)} is gepubliceerd. Mail naar de ingeplanden dat de planning beschikbaar is.`,
  },
  reminder_due: {
    title: 'Stuur herinneringsmail',
    detail: (shop, month) => `${shop} – herinnering aan medewerkers van ${monthLabel(month)} die hun beschikbaarheden nog niet bevestigd hebben. (Wie niets doorgeeft tegen de bevestigingsdeadline wordt automatisch behandeld als afgekocht.)`,
  },
}

export default function AdminActionBanner() {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('pending_admin_actions')
      .select('*')
      .order('created_at')
    setItems(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function markDone(id) {
    setBusy(true)
    try {
      await supabase.rpc('mark_admin_action_done', { p_id: id })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 14, background: '#fff4e2', borderColor: '#d88', color: '#8a571f' }}>
      <div className="section-title" style={{ color: '#8a571f' }}>
        Te versturen mails ({items.length})
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        Tot het automatisch mailsysteem actief is, stuur je deze berichten zelf. Klik op "Verstuurd" zodra de mail eruit is, dan verdwijnt het item.
      </div>
      {items.map((it) => {
        const def = KIND_LABELS[it.kind]
        if (!def) return null
        return (
          <div className="row-item" key={it.id}>
            <span style={{ flex: 1 }}>
              <strong>{def.title}</strong>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                {def.detail(it.shop_name || '?', it.month_start)}
              </div>
            </span>
            <button className="btn" disabled={busy} onClick={() => markDone(it.id)} style={{ whiteSpace: 'nowrap' }}>
              Verstuurd
            </button>
          </div>
        )
      })}
    </div>
  )
}
