import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog.jsx'

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const ROLE_LABEL = { flexi: 'Flexi', jobstudent: 'Jobstudent', ondernemer: 'Ondernemer' }

export default function ShopmanagerPeople({ shopId }) {
  const [ondernemers, setOndernemers] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editor, setEditor] = useState(null)
  const [dialog, setDialog] = useState(null) // null | {linkId, name}

  const load = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
    try {
      const { data: es } = await supabase
        .from('entrepreneur_shops')
        .select('id, must_operate, employees(id, first_name, last_name, company_name, email)')
        .eq('shop_id', shopId)
      const ond = (es || []).map((r) => ({
        linkId: r.id,
        must_operate: r.must_operate,
        employeeId: r.employees?.id,
        first_name: r.employees?.first_name || '',
        last_name: r.employees?.last_name || '',
        company_name: r.employees?.company_name || '',
        email: r.employees?.email || '',
      }))
      ond.sort((a, b) => a.first_name.localeCompare(b.first_name))
      setOndernemers(ond)

      const { data: w } = await supabase
        .from('employees')
        .select('id, first_name, last_name, email, role')
        .in('role', ['flexi', 'jobstudent'])
        .order('first_name')
      setWorkers(w || [])
    } catch (e) {
      setMsg({ kind: 'err', text: 'Laden mislukt.' })
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => {
    load()
  }, [load])

  function addOndernemer() {
    setMsg(null)
    setEditor({ kind: 'ondernemer', mode: 'add', first_name: '', last_name: '', company_name: '', email: '', must_operate: true })
  }
  function editOndernemer(o) {
    setMsg(null)
    setEditor({ kind: 'ondernemer', mode: 'edit', linkId: o.linkId, employeeId: o.employeeId, first_name: o.first_name, last_name: o.last_name, company_name: o.company_name, email: o.email, must_operate: o.must_operate })
  }
  function addWorker() {
    setMsg(null)
    setEditor({ kind: 'worker', mode: 'add', first_name: '', last_name: '', email: '', role: 'flexi' })
  }
  function editWorker(w) {
    setMsg(null)
    setEditor({ kind: 'worker', mode: 'edit', employeeId: w.id, first_name: w.first_name, last_name: w.last_name || '', email: w.email, role: w.role })
  }

  async function saveEditor() {
    const e = editor
    if (!e) return
    if (!e.first_name.trim() || !e.email.trim()) {
      setMsg({ kind: 'err', text: 'Voornaam en e-mail zijn verplicht.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      if (e.kind === 'ondernemer') {
        if (e.mode === 'add') {
          // bestaat de persoon al? (zelfde e-mail) -> bestaande koppelen
          const { data: existing } = await supabase.from('employees').select('id').eq('email', e.email.trim()).maybeSingle()
          let empId = existing?.id
          if (empId && ondernemers.some((o) => o.employeeId === empId)) {
            setMsg({ kind: 'err', text: 'Deze ondernemer is al aan deze winkel gekoppeld.' })
            setBusy(false)
            return
          }
          if (!empId) {
            const { data: ins, error: insErr } = await supabase
              .from('employees')
              .insert({ role: 'ondernemer', first_name: e.first_name.trim(), last_name: e.last_name.trim() || null, company_name: e.company_name.trim() || null, email: e.email.trim() })
              .select('id')
              .single()
            if (insErr) throw insErr
            empId = ins.id
          }
          const { error: linkErr } = await supabase
            .from('entrepreneur_shops')
            .insert({ entrepreneur_id: empId, shop_id: shopId, start_date: ymd(new Date()), must_operate: e.must_operate })
          if (linkErr) throw linkErr
        } else {
          const { error: upErr } = await supabase
            .from('employees')
            .update({ first_name: e.first_name.trim(), last_name: e.last_name.trim() || null, company_name: e.company_name.trim() || null, email: e.email.trim() })
            .eq('id', e.employeeId)
          if (upErr) throw upErr
          const { error: linkErr } = await supabase
            .from('entrepreneur_shops')
            .update({ must_operate: e.must_operate })
            .eq('id', e.linkId)
          if (linkErr) throw linkErr
        }
      } else {
        // worker
        if (e.mode === 'add') {
          const { data: existing } = await supabase.from('employees').select('id').eq('email', e.email.trim()).maybeSingle()
          if (existing) {
            setMsg({ kind: 'err', text: 'Er bestaat al iemand met dit e-mailadres.' })
            setBusy(false)
            return
          }
          const { error: insErr } = await supabase
            .from('employees')
            .insert({ role: e.role, first_name: e.first_name.trim(), last_name: e.last_name.trim() || null, email: e.email.trim() })
          if (insErr) throw insErr
        } else {
          const { error: upErr } = await supabase
            .from('employees')
            .update({ first_name: e.first_name.trim(), last_name: e.last_name.trim() || null, email: e.email.trim(), role: e.role })
            .eq('id', e.employeeId)
          if (upErr) throw upErr
        }
      }
      setEditor(null)
      await load()
      setMsg({ kind: 'good', text: 'Opgeslagen.' })
    } catch (err) {
      const m = err?.message || ''
      setMsg({ kind: 'err', text: m.includes('duplicate') || m.includes('unique') ? 'Dit e-mailadres is al in gebruik.' : 'Opslaan mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  async function doRemove() {
    const d = dialog
    setDialog(null)
    if (!d?.linkId) return
    setBusy(true)
    try {
      const { error } = await supabase.from('entrepreneur_shops').delete().eq('id', d.linkId)
      if (error) throw error
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: 'Verwijderen mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title" style={{ margin: 0 }}>Ondernemers ({ondernemers.length})</span>
          <button className="btn btn-primary" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addOndernemer}>
            + Toevoegen
          </button>
        </div>
        {ondernemers.length === 0 ? (
          <div className="muted">Nog geen ondernemers in deze winkel.</div>
        ) : (
          ondernemers.map((o) => (
            <div className="row-item" key={o.linkId}>
              <span>
                <strong>{o.first_name} {o.last_name}</strong>
                {o.company_name ? <span className="muted"> · {o.company_name}</span> : null}
                <br />
                <span className={'tag ' + (o.must_operate ? 'bevestigd' : 'niet')} style={{ fontSize: 10 }}>
                  {o.must_operate ? 'Uitbatingsplicht' : 'Geen uitbatingsplicht'}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => editOndernemer(o)}>Bewerken</button>
                <button className="btn" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => setDialog({ linkId: o.linkId, name: `${o.first_name} ${o.last_name}` })}>Verwijderen</button>
              </span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="section-title" style={{ margin: 0 }}>Flexi's & jobstudenten ({workers.length})</span>
          <button className="btn btn-primary" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addWorker}>
            + Toevoegen
          </button>
        </div>
        {workers.length === 0 ? (
          <div className="muted">Nog geen flexi's of jobstudenten.</div>
        ) : (
          workers.map((w) => (
            <div className="row-item" key={w.id}>
              <span>
                <strong>{w.first_name} {w.last_name}</strong>
                <span className="muted"> · {ROLE_LABEL[w.role] || w.role}</span>
              </span>
              <button className="btn" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => editWorker(w)}>Bewerken</button>
            </div>
          ))
        )}
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

      {editor && (
        <div style={ovl} onClick={() => setEditor(null)}>
          <div style={dlg} onClick={(ev) => ev.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>
              {editor.mode === 'add' ? 'Nieuw' : 'Bewerk'}{' '}
              {editor.kind === 'ondernemer' ? 'ondernemer' : 'medewerker'}
            </h3>

            <label className="flbl">Voornaam</label>
            <input className="input fw" value={editor.first_name} onChange={(e) => setEditor({ ...editor, first_name: e.target.value })} />

            <label className="flbl">Achternaam</label>
            <input className="input fw" value={editor.last_name} onChange={(e) => setEditor({ ...editor, last_name: e.target.value })} />

            <label className="flbl">E-mail</label>
            <input className="input fw" type="email" value={editor.email} onChange={(e) => setEditor({ ...editor, email: e.target.value })} />

            {editor.kind === 'ondernemer' ? (
              <>
                <label className="flbl">Bedrijfsnaam</label>
                <input className="input fw" value={editor.company_name} onChange={(e) => setEditor({ ...editor, company_name: e.target.value })} />
                <div className="row-item" style={{ marginTop: 8 }}>
                  <span>Uitbatingsplicht (1 dag/maand)</span>
                  <button className={'sw' + (editor.must_operate ? ' on' : '')} onClick={() => setEditor({ ...editor, must_operate: !editor.must_operate })} aria-label="Uitbatingsplicht">
                    <span className="knob" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="flbl">Rol</label>
                <select className="input fw" value={editor.role} onChange={(e) => setEditor({ ...editor, role: e.target.value })}>
                  <option value="flexi">Flexi</option>
                  <option value="jobstudent">Jobstudent</option>
                </select>
              </>
            )}

            {editor.mode === 'add' && (
              <div className="hint" style={{ marginTop: 10 }}>
                De persoon kan inloggen zodra zijn/haar account gekoppeld is.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setEditor(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={saveEditor} disabled={busy}>{busy ? 'Bezig…' : 'Opslaan'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title="Ondernemer uit winkel halen?"
        message={`Wil je ${dialog?.name || 'deze ondernemer'} uit deze winkel halen? Het account blijft bestaan (de ondernemer kan in een andere winkel liggen).`}
        confirmLabel="Ja, uit winkel halen"
        onConfirm={doRemove}
        onCancel={() => setDialog(null)}
      />
    </>
  )
}

const ovl = {
  position: 'fixed', inset: 0, background: 'rgba(42, 37, 33, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50,
}
const dlg = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
  padding: '22px', maxWidth: 380, width: '100%', maxHeight: '85vh', overflowY: 'auto',
  boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
}
