import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import ConfirmDialog from './ConfirmDialog.jsx'

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const ROLE_LABEL = { flexi: 'Flexi', jobstudent: 'Jobstudent', ondernemer: 'Ondernemer' }

export default function ShopmanagerPeople({ shopId }) {
  const [ondernemers, setOndernemers] = useState([])
  const [workers, setWorkers] = useState([])
  const [allOndernemers, setAllOndernemers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editor, setEditor] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
    try {
      const { data: es } = await supabase
        .from('entrepreneur_shops')
        .select('id, must_operate, operate_days, start_date, end_date, employees(id, first_name, last_name, company_name, email)')
        .eq('shop_id', shopId)
      const seen = new Set()
      const ond = []
      ;(es || []).forEach((r) => {
        const eid = r.employees?.id
        if (!eid || seen.has(eid)) return
        seen.add(eid)
        ond.push({
          linkId: r.id,
          must_operate: r.must_operate,
          operate_days: r.operate_days || 1,
          start_date: r.start_date,
          end_date: r.end_date,
          employeeId: eid,
          first_name: r.employees?.first_name || '',
          last_name: r.employees?.last_name || '',
          company_name: r.employees?.company_name || '',
          email: r.employees?.email || '',
        })
      })
      ond.sort((a, b) => a.first_name.localeCompare(b.first_name))
      setOndernemers(ond)

      const { data: w } = await supabase
        .from('employees')
        .select('id, first_name, last_name, email, role, active')
        .in('role', ['flexi', 'jobstudent'])
        .order('first_name')
      setWorkers(w || [])

      const { data: ao } = await supabase
        .from('employees')
        .select('id, first_name, last_name, email, company_name')
        .eq('role', 'ondernemer')
        .eq('active', true)
        .order('first_name')
      setAllOndernemers(ao || [])
    } catch (e) {
      setMsg({ kind: 'err', text: 'Laden mislukt.' })
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => {
    load()
  }, [load])

  function addPerson() {
    setMsg(null)
    setEditor({
      mode: 'add', role: 'ondernemer',
      first_name: '', last_name: '', email: '', company_name: '',
      must_operate: true, operate_days: 1, start_date: ymd(new Date()), end_date: '', active: true,
    })
  }
  function editOndernemer(o) {
    setMsg(null)
    setEditor({
      mode: 'edit', role: 'ondernemer', linkId: o.linkId, employeeId: o.employeeId,
      first_name: o.first_name, last_name: o.last_name, email: o.email, company_name: o.company_name,
      must_operate: o.must_operate, operate_days: o.operate_days, start_date: o.start_date, end_date: o.end_date || '',
    })
  }
  function editWorker(w) {
    setMsg(null)
    setEditor({
      mode: 'edit', role: w.role, employeeId: w.id,
      first_name: w.first_name, last_name: w.last_name || '', email: w.email, active: w.active,
    })
  }

  async function toggleWorkerActive(w) {
    try {
      const { error } = await supabase.from('employees').update({ active: !w.active }).eq('id', w.id)
      if (error) throw error
      setWorkers((prev) => prev.map((x) => (x.id === w.id ? { ...x, active: !x.active } : x)))
    } catch (e) {
      setMsg({ kind: 'err', text: 'Bijwerken mislukt.' })
    }
  }

  async function saveEditor() {
    const e = editor
    if (!e) return
    if (!e.first_name.trim() || !e.email.trim()) {
      setMsg({ kind: 'err', text: 'Voornaam en e-mail zijn verplicht.' })
      return
    }
    const isOnd = e.role === 'ondernemer'
    setBusy(true)
    setMsg(null)
    try {
      if (isOnd) {
        if (e.mode === 'add') {
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
              .select('id').single()
            if (insErr) throw insErr
            empId = ins.id
          }
          const { error: linkErr } = await supabase.from('entrepreneur_shops').insert({
            entrepreneur_id: empId, shop_id: shopId, start_date: e.start_date || ymd(new Date()),
            end_date: e.end_date || null, must_operate: e.must_operate, operate_days: Number(e.operate_days) || 1,
          })
          if (linkErr) throw linkErr
        } else {
          const { error: upErr } = await supabase.from('employees')
            .update({ first_name: e.first_name.trim(), last_name: e.last_name.trim() || null, company_name: e.company_name.trim() || null, email: e.email.trim() })
            .eq('id', e.employeeId)
          if (upErr) throw upErr
          const { error: linkErr } = await supabase.from('entrepreneur_shops')
            .update({ must_operate: e.must_operate, operate_days: Number(e.operate_days) || 1, start_date: e.start_date, end_date: e.end_date || null })
            .eq('id', e.linkId)
          if (linkErr) throw linkErr
        }
      } else {
        if (e.mode === 'add') {
          const { data: existing } = await supabase.from('employees').select('id').eq('email', e.email.trim()).maybeSingle()
          if (existing) {
            setMsg({ kind: 'err', text: 'Er bestaat al iemand met dit e-mailadres.' })
            setBusy(false)
            return
          }
          const { error: insErr } = await supabase.from('employees')
            .insert({ role: e.role, first_name: e.first_name.trim(), last_name: e.last_name.trim() || null, email: e.email.trim(), active: e.active })
          if (insErr) throw insErr
        } else {
          const { error: upErr } = await supabase.from('employees')
            .update({ first_name: e.first_name.trim(), last_name: e.last_name.trim() || null, email: e.email.trim(), active: e.active })
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

  const q = search.trim().toLowerCase()
  const filteredOndernemers = useMemo(() => {
    if (!q) return ondernemers
    return ondernemers.filter((o) => {
      const s = [o.first_name, o.last_name, o.company_name].filter(Boolean).join(' ').toLowerCase()
      return s.includes(q)
    })
  }, [ondernemers, q])
  const filteredWorkers = useMemo(() => {
    if (!q) return workers
    return workers.filter((w) => {
      const s = [w.first_name, w.last_name].filter(Boolean).join(' ').toLowerCase()
      return s.includes(q)
    })
  }, [workers, q])

  if (loading) {
    return <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Laden…</div>
  }

  const isOnd = editor?.role === 'ondernemer'

  return (
    <>
      <button className="btn btn-primary btn-block" onClick={addPerson} style={{ marginBottom: 12 }}>
        + Persoon toevoegen
      </button>

      <input
        className="input fw"
        type="text"
        placeholder="Zoek op naam of bedrijf…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      <div className="card">
        <div className="section-title">
          Ondernemers ({q ? `${filteredOndernemers.length} / ${ondernemers.length}` : ondernemers.length})
        </div>
        {ondernemers.length === 0 ? (
          <div className="muted">Nog geen ondernemers in deze winkel.</div>
        ) : filteredOndernemers.length === 0 ? (
          <div className="muted">Geen ondernemers gevonden.</div>
        ) : (
          filteredOndernemers.map((o) => (
            <div className="row-item" key={o.linkId}>
              <span>
                <strong>{o.first_name} {o.last_name}</strong>
                {o.company_name ? <span className="muted"> · {o.company_name}</span> : null}
                <br />
                <span className={'tag ' + (o.must_operate ? 'bevestigd' : 'niet')} style={{ fontSize: 10 }}>
                  {o.must_operate ? (o.operate_days > 1 ? `${o.operate_days} uitbatingsdagen` : '1 uitbatingsdag') : 'Standaardcommissie'}
                </span>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  vanaf {fmtDate(o.start_date)}{o.end_date ? ` tot ${fmtDate(o.end_date)}` : ''}
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
        <div className="section-title">
          Flexi's & jobstudenten ({q ? `${filteredWorkers.length} / ${workers.length}` : workers.length})
        </div>
        {workers.length === 0 ? (
          <div className="muted">Nog geen flexi's of jobstudenten.</div>
        ) : filteredWorkers.length === 0 ? (
          <div className="muted">Geen flexi's of jobstudenten gevonden.</div>
        ) : (
          filteredWorkers.map((w) => (
            <div className="row-item" key={w.id}>
              <span>
                <strong style={{ opacity: w.active ? 1 : 0.5 }}>{w.first_name} {w.last_name}</strong>
                <span className="muted"> · {ROLE_LABEL[w.role] || w.role}</span>
                {!w.active && <span className="tag niet" style={{ fontSize: 10, marginLeft: 8 }}>Niet actief</span>}
              </span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <button className={'sw' + (w.active ? ' on' : '')} onClick={() => toggleWorkerActive(w)} aria-label="Actief">
                  <span className="knob" />
                </button>
                <button className="btn" style={{ padding: '5px 10px', fontSize: 13 }} onClick={() => editWorker(w)}>Bewerken</button>
              </span>
            </div>
          ))
        )}
        <div className="hint" style={{ marginBottom: 0 }}>Niet-actieve medewerkers krijgen geen mails en worden niet ingepland.</div>
      </div>

      {msg && <div className={`msg ${msg.kind === 'err' ? 'err' : 'good'}`}>{msg.text}</div>}

      {editor && (
        <div style={ovl} onClick={() => setEditor(null)}>
          <div style={dlg} onClick={(ev) => ev.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>{editor.mode === 'add' ? 'Nieuwe persoon' : 'Bewerken'}</h3>

            {editor.mode === 'add' ? (
              <>
                <label className="flbl">Type</label>
                <select className="input fw" value={editor.role} onChange={(e) => setEditor({ ...editor, role: e.target.value, picked_id: '' })}>
                  <option value="ondernemer">Ondernemer</option>
                  <option value="flexi">Flexi</option>
                  <option value="jobstudent">Jobstudent</option>
                </select>

                {editor.role === 'ondernemer' && (() => {
                  const linkedIds = new Set(ondernemers.map((o) => o.employeeId))
                  const choices = allOndernemers.filter((o) => !linkedIds.has(o.id))
                  return (
                    <>
                      <label className="flbl" style={{ marginTop: 10 }}>Bestaande ondernemer kiezen (of nieuw aanmaken)</label>
                      <select
                        className="input fw"
                        value={editor.picked_id || ''}
                        onChange={(ev) => {
                          const pid = ev.target.value
                          if (!pid) {
                            setEditor({ ...editor, picked_id: '', first_name: '', last_name: '', email: '', company_name: '' })
                          } else {
                            const p = choices.find((c) => c.id === pid)
                            if (p) {
                              setEditor({
                                ...editor,
                                picked_id: pid,
                                first_name: p.first_name || '',
                                last_name: p.last_name || '',
                                email: p.email || '',
                                company_name: p.company_name || '',
                              })
                            }
                          }
                        }}
                      >
                        <option value="">— nieuwe ondernemer aanmaken —</option>
                        {choices.map((o) => (
                          <option key={o.id} value={o.id}>
                            {[o.first_name, o.last_name].filter(Boolean).join(' ')}
                            {o.company_name ? ` · ${o.company_name}` : ''}
                            {o.email ? ` · ${o.email}` : ''}
                          </option>
                        ))}
                      </select>
                      <div className="hint" style={{ marginTop: 4 }}>
                        {editor.picked_id
                          ? 'Deze ondernemer wordt gekoppeld aan deze winkel — naam en e-mail kunnen niet hier gewijzigd worden.'
                          : 'Vul hieronder de gegevens in om een nieuwe ondernemer te registreren. E-mailadres moet uniek zijn.'}
                      </div>
                    </>
                  )
                })()}
              </>
            ) : (
              <div className="muted" style={{ marginBottom: 4 }}>{ROLE_LABEL[editor.role] || editor.role}</div>
            )}

            <label className="flbl">Voornaam</label>
            <input className="input fw" value={editor.first_name} disabled={!!editor.picked_id} onChange={(e) => setEditor({ ...editor, first_name: e.target.value })} />

            <label className="flbl">Achternaam</label>
            <input className="input fw" value={editor.last_name} disabled={!!editor.picked_id} onChange={(e) => setEditor({ ...editor, last_name: e.target.value })} />

            <label className="flbl">E-mail</label>
            <input className="input fw" type="email" value={editor.email} disabled={!!editor.picked_id} onChange={(e) => setEditor({ ...editor, email: e.target.value })} />

            {isOnd ? (
              <>
                <label className="flbl">Bedrijfsnaam</label>
                <input className="input fw" value={editor.company_name} disabled={!!editor.picked_id} onChange={(e) => setEditor({ ...editor, company_name: e.target.value })} />

                <div className="row-item" style={{ marginTop: 8 }}>
                  <span>
                    Hoger commissiepercentage
                    <div className="muted" style={{ fontSize: 12, fontWeight: 400, marginTop: 2 }}>
                      Aan = ondernemer draagt een hogere commissie af (35 %, 50 %, inkoop) en moet daarvoor uitbatingsdagen doen. Uit = standaardpercentage, géén uitbatingsdagen. Afkoop is iets anders en regelt de ondernemer zelf per maand.
                    </div>
                  </span>
                  <button className={'sw' + (editor.must_operate ? ' on' : '')} onClick={() => setEditor({ ...editor, must_operate: !editor.must_operate })} aria-label="Hoger commissiepercentage">
                    <span className="knob" />
                  </button>
                </div>

                {editor.must_operate && (
                  <>
                    <label className="flbl">Aantal uitbatingsdagen in deze winkel</label>
                    <input className="input" type="number" min="1" max="20" style={{ width: 90 }}
                      value={editor.operate_days} onChange={(e) => setEditor({ ...editor, operate_days: e.target.value })} />
                  </>
                )}

                <label className="flbl">Actief vanaf</label>
                <input className="input fw" type="date" value={editor.start_date} onChange={(e) => setEditor({ ...editor, start_date: e.target.value })} />

                <label className="flbl">Gestopt op (leeg = nog actief)</label>
                <input className="input fw" type="date" value={editor.end_date} onChange={(e) => setEditor({ ...editor, end_date: e.target.value })} />
              </>
            ) : (
              <div className="row-item" style={{ marginTop: 8 }}>
                <span>Actief</span>
                <button className={'sw' + (editor.active ? ' on' : '')} onClick={() => setEditor({ ...editor, active: !editor.active })} aria-label="Actief">
                  <span className="knob" />
                </button>
              </div>
            )}

            {editor.mode === 'add' && (
              <div className="hint" style={{ marginTop: 10 }}>De persoon kan inloggen zodra zijn/haar account gekoppeld is.</div>
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
  padding: '22px', maxWidth: 380, width: '100%', maxHeight: '88vh', overflowY: 'auto',
  boxShadow: '0 16px 40px rgba(42, 37, 33, 0.18)',
}
