# CleanBase on Supabase: setup

CleanBase runs in two modes:

- **Local demo mode** (no keys): everything stays in the browser. Good for trying the app.
- **Cloud mode** (Supabase keys present): real accounts, a shared database, live updates between users, private photo storage.

## 1. Create the project

1. Create a project at supabase.com.
2. **Authentication, Providers, Email**: turn **off "Confirm email"** (sign up then works in one step). You can turn it back on later once you add your own email sender.
3. **Authentication, URL Configuration**: set the Site URL to where the app runs (for local work `http://localhost:5173`).

## 2. Create the database

Open **SQL Editor** and run **`MASTER_SETUP.sql`**: it holds every migration in order and is safe to run again.
Run it again whenever a new migration is added (it is rebuilt with `node supabase/build-master.cjs`).

The files it is made of, if you prefer to run them one at a time:

1. `migrations/0001_schema_and_security.sql` tables and row level security
2. `migrations/0002_public_api.sql` registration, client portal, review links, export
3. `migrations/0003_automations.sql` recurring bookings and alerts
4. `migrations/0004_supabase_extras.sql` photo storage bucket, realtime, hourly schedule
5. `migrations/0005_booking_store.sql` public booking store: free times, requests, safe booking
6. `migrations/0006_store_insights.sql` anonymous store visit counts and conversion
7. `migrations/0007` to `0015` store branding, opening hours, staff videos, company guard, driver trips, reservations
8. `migrations/0016_collection_views.sql` one readable view per collection (bookings, clients, invoices...) in the Table Editor. Read-only for you; the app keeps using `records`. Re-run `select public.cb_refresh_collection_views();` after new kinds of data appear
9. `migrations/0017_signup_phone.sql` the sign-up contact phone: `register_company` accepts it and keeps it on the company

For the extras file you first need **Database, Extensions, pg_cron** enabled. If a line errors because a feature is off, enable it and run the file again.

## 3. Create the platform admin (you)

In the SQL editor run (with your own email):

```sql
select public.cb_make_superadmin('you@example.com', 'Your Name');
```

Then open the app, choose **Start for free**, and sign up with that email and a strong password. Your account links to the admin profile automatically. Leave the company name blank. (If you already signed up, the same command links you.)

## 3b. Let the platform admin set passwords (optional, recommended)

Supabase never stores readable passwords, so passwords can be replaced but never shown. To let the platform admin set a new password for a tenant owner from the **Tenants** page:

1. Dashboard, **Edge Functions**, **Deploy a new function**, **Via Editor**.
2. Name it exactly `admin-set-password`.
3. Paste the contents of `supabase/functions/admin-set-password/index.ts` and click **Deploy**. Leave "Verify JWT" on.

The function runs on Supabase servers and checks in the database that the caller is the platform admin before changing anything. The service key never reaches the browser.

## 3b-2. Drivers who sign in with a phone number (needed for the driver app)

Each company gives its drivers a page of its own (`/driver/login?c=<company id>`). A driver signs in with a **phone number and a password** that the company owner creates in **Settings, Drivers**. Creating a login for someone else needs the service key, so it is done by an Edge Function:

1. Dashboard, **Edge Functions**, **Deploy a new function**, **Via Editor**.
2. Name it exactly `driver-admin`.
3. Paste the contents of `supabase/functions/driver-admin/index.ts` and click **Deploy**. Leave "Verify JWT" on.

The function checks in the database that the caller is an active company owner or manager, takes the company from the caller's own profile, and only ever touches drivers of that company. Without it, **Add driver** shows "The driver service is not set up yet". (In local demo mode no function is needed.)

## 3c. The AI Manager (CleanBase AI Master plan)

The AI Manager page works as soon as a company is on the **CleanBase AI Master** plan, with **no outside service**. A built-in engine reads that company's real bookings, money, staff and stock, finds problems and suggests the fix for each, answers questions in English and Arabic, and builds a daily report that can be shared on WhatsApp.

Optional upgrade so replies sound more like a person (uses a language model provider, costs money per question, and sends a summary of the company's facts to that provider):

1. Edge Functions, **Deploy a new function**, **Via Editor**, name it `ai-manager`, paste `supabase/functions/ai-manager/index.ts`, Deploy.
2. Edge Functions, **Secrets**, add `ANTHROPIC_API_KEY`.
3. In `.env.local` add `VITE_AI_FUNCTION=ai-manager` (use the name shown in the function URL) and restart `npm run dev`.

If the function is missing or fails, the page quietly falls back to the built-in engine.

Two-way chat on WhatsApp is not included. It needs the WhatsApp Business platform (a verified business number, message templates and a webhook), which is a separate paid integration.

## 4. Connect the app

```bash
cp .env.example .env.local     # then paste your project URL and anon key
npm install
npm run dev
```

## How people get access

- **A new company owner** signs up with *Start for free*. They land on "Account under review" until you approve them in **Tenants** (the Approve toggle).
- **A team member** (cleaner, dispatcher, accountant): the owner adds them in **Settings, Team** with their email and role. The person signs up with *Start for free* using that same email (company name blank) and is linked automatically.
- **Public booking page**: `https://your-app/book?c=<company id>` (the link is shown in **Business rules**).

## Check the security rules

```bash
npm run test:db
```

This runs the real SQL in an in-process Postgres and tries to break it: reading another company's rows, writing into it, taking over its ids, escalating a role, anonymous access, and more.

## What runs automatically

`public.run_automations()` runs every hour (pg_cron): it creates the next 14 days of bookings for active recurring subscriptions, and adds notifications for overdue invoices, expiring staff documents and low stock. No outside services are used.

## Known limits

- The client portal identifies a customer by phone number only. Before showing money details or allowing payments, add a PIN or one-time code.
- The public booking function validates input but has no rate limit. Add one (for example with a CAPTCHA or an edge function) before promoting the link widely.
- Realtime delete events expose only the id of a deleted row to other signed-in users of the same project.
- Rows are stored as JSON documents in one table. This keeps the app flexible; move hot collections (bookings, invoices) to dedicated columns if you pass tens of thousands of rows per company.
- If two people edit the same record at the same moment, the last save wins.

