# Angels Oasis Referral Outreach AI (CRM)

A lead-generation + email-outreach CRM for Angels Oasis (a licensed CLHF) — internal staff app only,
no public marketing site: Leads CRM, Hospitals Map, Campaigns, a manual Campaign Writer, Email
Analytics, Facilities, Contacts, Settings, and simple
email/password login + logout.

This is a real, working scaffold — not a mockup. Every page reads/writes real Supabase tables. It's
deliberately an MVP: solid data model and core flows, built out further as you go.

## 1. Where each API key goes — read this first

**Nothing secret ever goes in this codebase or in a `.env` file that ships to the browser.**

| Key | Where it goes | Why |
| --- | --- | --- |
| Supabase **publishable** key (`sb_publishable_...`) + project URL | `.env.local` at the project root (copy `.env.example`), or your host's frontend env vars (Vercel/Netlify → Project → Environment Variables) | Safe to expose client-side by design — same idea as a Stripe publishable key |
| Supabase **service-role** key | Supabase Edge Function secrets only, if a separately deployed server-side function requires it | Full DB access — must never reach the browser |
| Email provider key (Resend/SendGrid/etc.) | `supabase secrets set EMAIL_PROVIDER_API_KEY=...` (for the send-job function you add — see §5) | Server-side only |
| Maps/Places API key (if you swap Leaflet for Google Maps) | `.env.local` as `VITE_GOOGLE_MAPS_KEY` if it's a browser-restricted key, otherwise as a Supabase secret if used server-side for Places lookups | Depends on how you restrict the key in Google Cloud Console |

The manual Campaign Writer does not call an AI provider or require DeepSeek/API secrets. It writes
drafts directly to the authenticated Supabase tables.

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Project Settings → API: copy the **Project URL** and the **publishable key** into `.env.local`
   (`cp .env.example .env.local`, then fill in `VITE_SUPABASE_URL`; the publishable key given in the
   spec doc, `sb_publishable_757vU4WoOyLcRlq0wvWc4w_Nu9UbdVS`, is already filled in as an example).
3. Apply the schema migrations in order: `supabase db push` (with the CLI linked), or run each
   `supabase/migrations/*.sql` file in order in the Supabase SQL editor. The campaign draft limit
   migration adds the draft-library flag and enforces a maximum of 100 saved drafts for each genre.
4. Create a staff login: Authentication → Users → Add user (email + password). Then, in the SQL
   editor, give them a role:
   ```sql
   insert into profiles (id, role) values ('<user-id-from-auth-users>', 'admin');
   ```
5. The Campaign Writer works without deploying an Edge Function. It supports Weekly Newsletter,
   Facility Education, and Testimonials / Blog drafts, with up to 100 saved drafts per genre.

## 3. Run it locally

```bash
npm install
npm run dev
```

Visiting `http://localhost:5173/` goes straight to `/app`, which bounces to `/app/login` if you're
signed out. There's no public-facing page — this build is CRM only.

## 4. What's implemented vs. what's a stub

**Fully working:** email/password login and logout (Supabase Auth), Leads CRUD, the Hospitals Map
(radius filter + markers against real lead data, using Leaflet/OpenStreetMap so no maps API key is
required out of the box), the Campaign Writer (manual draft creation, stored in Supabase with a
100-draft-per-genre limit), the Campaigns page,
Email Analytics (reads real `emails` rows), Dashboard KPIs, protected routing (every `/app/*` route
redirects to `/app/login` when signed out).

**Stubbed / next steps:**
- **The send-when-approved time trigger**
  aren't wired up yet. Add them as [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions):
  a cron job that queries
  `campaigns` where `approval_status = 'approved' and send_date <= now()`, generates `emails` rows
  from `leads`, calls your email provider, and updates `emails.status`. This second function is the
  one place `EMAIL_PROVIDER_API_KEY` belongs.
- **Map-based lead auto-discovery** (Places API search within a radius) — the map currently filters
  leads you already have; swapping in Google Places for *new* facility discovery is a contained
  addition to `HospitalsMap.tsx` plus a small Edge Function to keep that key server-side.
   CSV import for leads.
- Unsubscribe link handling / suppression list enforcement in the send job.
- Settings page is read-only guidance right now — wire up real role management and a masked-key
  admin UI if you want that in-app rather than via CLI secrets.

## 5. Deploying

- **Frontend:** any static host that supports Vite builds (Vercel, Netlify, Cloudflare Pages). Set
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in that host's environment variable
  settings — never commit `.env.local`.
- **Backend:** Supabase hosts your database, auth, and Edge Functions — nothing else to deploy there.

## 6. Design system

Three colors only, defined once in `tailwind.config.js`: **white** (backgrounds), **plum** (`#4A1D3D`
— sidebar, headings, brand accents), and **black** (token name `ink`, `#0A0A0A` — primary buttons,
active nav state, strong text). No other colors are used anywhere in the app, including the
Hospitals Map's category markers, which are shades of plum/black/gray rather than arbitrary colors.
