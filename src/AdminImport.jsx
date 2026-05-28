import { useState } from 'react'
import { supabase } from './supabaseClient'

// Verwachte kolommen (volgorde maakt niet uit, hoofdletters maakt niet uit):
// bedrijfsnaam | voornaam | familienaam | email | winkel | startdatum | stopdatum | uitbatingsdagen | hogere_commissie | rol
// Voor ondernemers (rol leeg of "ondernemer"): winkel + startdatum verplicht.
// Voor flexi/jobstudent (rol = "flexi" of "jobstudent"): enkel voornaam + email nodig.
const REQUIRED = ['voornaam', 'email']
const SAMPLE =
  'bedrijfsnaam\tvoornaam\tfamilienaam\temail\twinkel\tstartdatum\tstopdatum\tuitbatingsdagen\thogere_commissie\trol\n' +
  'Kaashuis Maes\tTom\tMaes\ttom@maes.be\tAalst\t2026-01-01\t\t2\tnee\t\n' +
  'Wijnhuis De Smet\tLien\tDe Smet\tlien@desmet.be\tAalst\t2026-01-01\t2026-08-31\t\tja\t\n' +
  '\tAnnemie\tBaert\tannemie.braet@hotmail.be\t\t\t\t\t\tflexi\n' +
  '\tEmily\tBlanchetot\temily@example.be\t\t\t\t\t\tjobstudent'

export default function AdminImport() {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null) // null | {rows, errors, headers}
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // null | {created_people, created_links, skipped, errors}

  function parse() {
    setResult(null)
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) {
      setPreview({ rows: [], errors: ['Plak minstens één rij gegevens onder de hoofding.'], headers: [] })
      return
    }
    const delim = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase())
    const missing = REQUIRED.filter((r) => !headers.includes(r))
    if (missing.length) {
      setPreview({ rows: [], errors: [`Hoofding mist verplichte kolommen: ${missing.join(', ')}`], headers })
      return
    }
    const idx = (k) => headers.indexOf(k)
    const rows = []
    const errors = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(delim).map((c) => c.trim())
      const get = (k) => (idx(k) >= 0 ? cells[idx(k)] || '' : '')
      const rawRole = get('rol').toLowerCase()
      const role = rawRole || 'ondernemer'
      const r = {
        line: i + 1,
        role,
        company: get('bedrijfsnaam'),
        first: get('voornaam'),
        last: get('familienaam'),
        email: get('email').toLowerCase(),
        shop: get('winkel'),
        start: get('startdatum'),
        end: get('stopdatum'),
        days: get('uitbatingsdagen'),
        higher: yesNo(get('hogere_commissie')),
        problems: [],
      }
      if (!r.first) r.problems.push('voornaam leeg')
      if (!r.email) r.problems.push('e-mail leeg')
      if (!['ondernemer', 'flexi', 'jobstudent'].includes(role)) {
        r.problems.push(`rol "${rawRole}" niet geldig (gebruik ondernemer, flexi of jobstudent)`)
      }
      if (role === 'ondernemer') {
        if (!r.shop) r.problems.push('winkel leeg')
        if (!isDate(r.start)) r.problems.push('startdatum ongeldig (gebruik 2026-01-31)')
        if (r.end && !isDate(r.end)) r.problems.push('stopdatum ongeldig')
        if (!r.higher) {
          const n = r.days === '' ? 1 : Number(r.days)
          if (!Number.isInteger(n) || n < 1) r.problems.push('uitbatingsdagen moet 1 of meer zijn')
          r.operate_days = Number.isInteger(n) && n >= 1 ? n : 1
        } else {
          r.operate_days = 1
        }
      }
      rows.push(r)
    }
    setPreview({ rows, errors, headers })
  }

  async function runImport() {
    if (!preview || preview.errors.length) return
    setBusy(true)
    setResult(null)
    try {
      // 1) Winkels naar id mappen (case-insensitief)
      const { data: shops } = await supabase.from('shops').select('id, name')
      const shopByName = new Map()
      ;(shops || []).forEach((s) => shopByName.set(s.name.toLowerCase(), s.id))

      // 2) Bestaande ondernemers per e-mail
      const emails = [...new Set(preview.rows.filter((r) => !r.problems.length).map((r) => r.email))]
      const { data: existing } = emails.length
        ? await supabase.from('employees').select('id, email').in('email', emails)
        : { data: [] }
      const empByEmail = new Map((existing || []).map((e) => [e.email.toLowerCase(), e.id]))

      let createdPeople = 0
      let createdLinks = 0
      let skipped = 0
      const errors = []

      for (const r of preview.rows) {
        if (r.problems.length) {
          errors.push(`Regel ${r.line}: ${r.problems.join(', ')}`)
          continue
        }

        // Flexi / jobstudent: enkel persoon aanmaken (geen winkelkoppeling).
        if (r.role === 'flexi' || r.role === 'jobstudent') {
          if (empByEmail.get(r.email)) { skipped++; continue }
          const { data: ins, error: insErr } = await supabase
            .from('employees')
            .insert({
              role: r.role,
              first_name: r.first,
              last_name: r.last || null,
              email: r.email,
            })
            .select('id')
            .single()
          if (insErr || !ins) {
            errors.push(`Regel ${r.line}: persoon aanmaken mislukt (${insErr?.message || 'onbekend'})`)
            continue
          }
          empByEmail.set(r.email, ins.id)
          createdPeople++
          continue
        }

        // Ondernemer: persoon + winkelkoppeling
        const shopId = shopByName.get(r.shop.toLowerCase())
        if (!shopId) {
          errors.push(`Regel ${r.line}: winkel "${r.shop}" niet gevonden`)
          continue
        }
        let empId = empByEmail.get(r.email)
        if (!empId) {
          const { data: ins, error: insErr } = await supabase
            .from('employees')
            .insert({
              role: 'ondernemer',
              first_name: r.first,
              last_name: r.last || null,
              email: r.email,
              company_name: r.company || null,
            })
            .select('id')
            .single()
          if (insErr || !ins) {
            errors.push(`Regel ${r.line}: persoon aanmaken mislukt (${insErr?.message || 'onbekend'})`)
            continue
          }
          empId = ins.id
          empByEmail.set(r.email, empId)
          createdPeople++
        }
        // Dezelfde (ondernemer, winkel)-koppeling al? Dan overslaan
        const { data: dup } = await supabase
          .from('entrepreneur_shops')
          .select('id')
          .eq('entrepreneur_id', empId)
          .eq('shop_id', shopId)
          .maybeSingle()
        if (dup) {
          skipped++
          continue
        }
        const { error: linkErr } = await supabase.from('entrepreneur_shops').insert({
          entrepreneur_id: empId,
          shop_id: shopId,
          start_date: r.start,
          end_date: r.end || null,
          must_operate: !r.higher,
          operate_days: r.operate_days,
        })
        if (linkErr) {
          errors.push(`Regel ${r.line}: koppelen mislukt (${linkErr.message})`)
          continue
        }
        createdLinks++
      }
      setResult({ createdPeople, createdLinks, skipped, errors })
    } catch (e) {
      setResult({ createdPeople: 0, createdLinks: 0, skipped: 0, errors: [e?.message || 'Onbekende fout'] })
    } finally {
      setBusy(false)
    }
  }

  const okCount = preview ? preview.rows.filter((r) => !r.problems.length).length : 0
  const badCount = preview ? preview.rows.filter((r) => r.problems.length).length : 0

  return (
    <>
      <div className="card">
        <div className="section-title">Medewerkers importeren</div>
        <div className="hint" style={{ marginTop: 0 }}>
          Kopieer je lijst uit Excel of Google Sheets met deze kolommen, en plak hieronder. Eén rij per
          (ondernemer, winkel)-combinatie — een ondernemer in meerdere winkels krijgt meerdere rijen.
          Voor flexi's of jobstudenten volstaat één rij per persoon met <em>rol = flexi</em> of <em>rol = jobstudent</em>;
          de winkel-, startdatum- en uitbatingsdagen-velden mogen dan leeg blijven.
          Bij <em>hogere_commissie = ja</em> wordt uitbatingsdagen genegeerd.
        </div>
        <div className="hint" style={{ fontFamily: 'monospace', fontSize: 12 }}>
          bedrijfsnaam · voornaam · familienaam · email · winkel · startdatum · stopdatum · uitbatingsdagen · hogere_commissie · rol
        </div>
        <textarea
          className="input fw"
          style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 13 }}
          placeholder="Plak hier je lijst (eerste regel = kolomnamen)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setText(SAMPLE)} disabled={busy}>Voorbeeld invullen</button>
          <button className="btn" onClick={parse} disabled={busy || !text.trim()}>Vooraf bekijken</button>
        </div>
      </div>

      {preview && (
        <div className="card">
          <div className="section-title">Voorbeeld</div>
          {preview.errors.length > 0 && (
            <div className="msg err">{preview.errors.join(' · ')}</div>
          )}
          {preview.rows.length > 0 && (
            <>
              <div className="hint" style={{ marginTop: 0 }}>
                {okCount} klaar om in te lezen · {badCount} met fouten (worden overgeslagen)
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                {preview.rows.map((r) => (
                  <div
                    key={r.line}
                    style={{
                      padding: '8px 10px', borderBottom: '1px solid var(--line)', fontSize: 13,
                      background: r.problems.length ? 'var(--danger-bg)' : 'transparent',
                    }}
                  >
                    <div>
                      <strong>{r.first} {r.last}</strong>
                      {r.company && <span className="muted"> · {r.company}</span>}
                      {' · '}{r.shop}
                      {' · '}{r.higher ? 'hogere commissie' : `${r.operate_days} dag${r.operate_days === 1 ? '' : 'en'}`}
                      <span className="muted"> · {r.start}{r.end ? ` → ${r.end}` : ''}</span>
                    </div>
                    {r.problems.length > 0 && (
                      <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 2 }}>
                        {r.problems.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {preview.errors.length === 0 && (
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 12 }}
                  onClick={runImport}
                  disabled={busy || okCount === 0}
                >
                  {busy ? 'Importeren…' : `Importeer ${okCount} rij${okCount === 1 ? '' : 'en'}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          <div className="section-title">Resultaat</div>
          <div>
            {result.createdPeople} nieuwe ondernemers aangemaakt · {result.createdLinks} koppelingen toegevoegd · {result.skipped} reeds bestaande overgeslagen
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="hint">Fouten:</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13, color: 'var(--danger)' }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ padding: '4px 0' }}>{e}</div>
                ))}
              </div>
            </>
          )}
          <div className="hint" style={{ marginBottom: 0 }}>
            De ondernemers staan nu in de databank. Voor hun login moet je per e-mailadres een account aanmaken in
            Authentication (komt later vanuit de app).
          </div>
        </div>
      )}
    </>
  )
}

function yesNo(v) {
  const x = (v || '').toLowerCase().trim()
  return x === 'ja' || x === 'true' || x === 'yes' || x === '1' || x === 'y'
}
function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime())
}
