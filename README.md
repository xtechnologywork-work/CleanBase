# CleanBase

CRM and ERP for cleaning companies. One place to run bookings, cleaners, clients, contracts, invoices, payroll and reports, plus a public booking store clients can use on their own.

Built with Vite, React 19 and TypeScript. Data lives in the browser (demo mode) or in Supabase (cloud mode).

## What is inside

**For the company owner**
- **Overview, Analytics, Reports:** revenue, profit, cash, late payments, busiest times, clients and cleaners, all from real records.
- **Bookings and Dispatch:** calendar and list, cleaner assignment with clash checks, job checklists and before/after photos.
- **Booking store:** a public link clients open to pick a service, a cleaner and a free time. Requests land in Bookings, where the owner accepts or declines. Store insights show visitors, live visitors and conversion.
- **Clients, Leads and quotes, Quality:** client profiles with lifetime spend from real payments, a sales pipeline, complaints, and customer reviews that the owner approves before they are published.
- **Contracts:** recurring subscriptions, contract templates written by each company, signing, monthly payment tracking, cancellation with reason and exact time, printing.
- **Money:** invoices and payments, expenses, payroll, and the late-payment view.
- **Team hub:** attendance, leave, documents with photos, payroll, performance.
- **AI Manager:** shown as "Coming soon" in the menu for now. The engine and the optional Edge Function are in the code and tested.
- **Arabic dashboard:** an English / Arabic switch next to the bell translates the whole company dashboard and flips it right to left.

**For the platform admin**
- Tenants, billing, plans, audit log and platform analytics. Sets a new password for a tenant (passwords are never shown).

## Run it

```bash
npm install
npm run dev
```

With no environment file the app runs in **local demo mode**: everything is stored in your browser. Sign in with `owner@company.com` and any password, then press **Load sample data** on the Overview.

### Cloud mode (Supabase)

1. Copy `.env.example` to `.env.local` and fill in your project URL and **anon/publishable** key. Never use the service role key in this app.
2. Follow [`supabase/README.md`](supabase/README.md): run `supabase/MASTER_SETUP.sql` in the SQL Editor and create the platform admin.
3. Restart `npm run dev`.

## Go live checklist

1. **Supabase:** create the project, run `supabase/MASTER_SETUP.sql` in the SQL Editor, then run `supabase/HEALTH_CHECK.sql` and confirm every line says OK.
2. **Auth settings:** Authentication, Email: turn off "Confirm email" (or add your own email sender). Authentication, URL Configuration: set the Site URL and add your live address to the redirect URLs.
3. **Edge Functions:** deploy `admin-set-password` and `driver-admin` (steps in `supabase/README.md`).
4. **Platform admin:** run `select public.cb_make_superadmin('you@example.com', 'Your Name');`, then sign up with that email.
5. **Hosting (Vercel, Netlify or similar):** build command `npm run build`, output folder `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables (never the service key). `vercel.json` and `public/_redirects` already send every address to the app, so links such as `/app/bookings` work after a refresh.
6. **Test once on the live site:** sign up a test company, approve it from the admin, add a cleaner and a client, create a booking, and open the booking store link.
7. **Before selling:** have the Terms and Privacy pages (`/terms`, `/privacy`) reviewed for your business and country, and set up database backups in Supabase (Pro plan has daily backups).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Lint the code |
| `npm run test:db` | Row level security and public functions, on a real Postgres (PGlite) |
| `npm run test:sync` | Local cache and Supabase sync layer |
| `npm run test:ai` | AI Manager engine |
| `npm run test:store` | Booking store availability rules and insights |
| `npm run test:trips`, `test:reservations`, `test:driveraccounts` ... | Driver rides, cleaner reservations, driver logins (see `package.json` for all) |
| `node supabase/build-master.cjs` | Rebuild `MASTER_SETUP.sql` from the migrations |

## Project layout

```
src/pages            screens (owner dashboard, public store, platform admin)
src/components       shared UI and feature components
src/services         data layer, replication, availability, contracts, AI engine
supabase/migrations  schema, security, public functions
supabase/functions   Edge Functions (admin password, optional AI manager)
tests                sync, AI and store tests
```

## Security notes

- Every table is protected by row level security: a company only reads and writes its own rows, and the policies are tested.
- Public visitors never read tables. They call small functions that return only what the public page needs and check every rule again on the server.
- Admin-only actions (such as setting a password) run in an Edge Function that holds the service key. That key is never in the app.
- `.env.local` is ignored by git. Keep your keys there.
