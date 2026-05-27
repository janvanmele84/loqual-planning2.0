# Loqual planning — frontend (React + Vite)

Eerste werkende stuk van de app: aanmelden, rol-routing, en het volledige
ondernemer-kalenderscherm verbonden met je Supabase-backend. De andere rollen
(shopmanager, admin, flexi, jobstudent) tonen voorlopig een "in opbouw"-pagina.

## 1. Opstarten

Je hebt Node.js nodig (versie 18 of hoger). Daarna, in deze map:

```bash
npm install
cp .env.example .env
```

Open `.env` en vul je Supabase-gegevens in (te vinden in Supabase >
Project Settings > API):

```
VITE_SUPABASE_URL=https://JOUWPROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=jouw-anon-public-key
```

Start dan de ontwikkelserver:

```bash
npm run dev
```

De app draait nu op http://localhost:5173

## 2. Inloggen testen

De backend kent je testmedewerkers al (Karim, Sofie, ...), maar die hebben nog
geen wachtwoord. Maak in Supabase een login aan en koppel ze:

1. Supabase > Authentication > Users > Add user. Maak bijvoorbeeld een gebruiker
   met e-mail `karim@loqual.be` (een ondernemer uit de testdata) en een wachtwoord.
2. Voer in de SQL Editor dit uit om de login aan de juiste medewerker te koppelen:

   ```sql
   update employees e
   set auth_user_id = u.id
   from auth.users u
   where u.email = e.email and e.auth_user_id is null;
   ```

3. Meld je in de app aan met `karim@loqual.be` en je wachtwoord. Je komt op de
   ondernemer-kalender voor de huidige maand.

> Tip: maak ook een login voor `admin@loqual.be` (admin), `sofie@loqual.be`
> (shopmanager) en `eva@loqual.be` (flexi) om de rol-routing te zien werken.

## 3. Bouwen voor productie

```bash
npm run build
```

De statische bestanden komen in `dist/`. Die kun je op elke statische host
zetten (Netlify, Vercel, of GitHub Pages). Vergeet niet de twee
omgevingsvariabelen ook bij je host in te stellen.

## Structuur

- `src/App.jsx` — sessiebeheer en rol-routing
- `src/Login.jsx` — aanmelden
- `src/Shell.jsx` — gedeelde kop met wordmark en afmelden
- `src/OndernemerCalendar.jsx` — het ondernemer-kalenderscherm
- `src/Placeholder.jsx` — tijdelijke pagina voor de overige rollen
- `src/supabaseClient.js` — verbinding met Supabase
