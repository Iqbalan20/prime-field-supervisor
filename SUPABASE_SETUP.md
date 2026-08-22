# Prime Field Supervisor — Supabase + GitHub + Vercel setup

## 1. Create Supabase project
Create a Supabase project and copy the Project URL and anon/public key.

## 2. Run database setup
Open Supabase → SQL Editor → New query. Paste and run `supabase/schema.sql`.

## 3. Create authentication users
Open Supabase → Authentication → Users → Add user.

### Management
Use the real management email, for example:
`admin@primegroupco.com`

### Supervisor
Use the internal email format:
`pfs-sup-001@primefield.local`

The supervisor enters only `PFS-SUP-001` in the app. The app maps that Employee ID to the internal Supabase email automatically.

For every supervisor, the Employee ID in Supabase must match the supervisor `empId` stored by the application.

## 4. Configure environment variables
Create `.env.local` for local development:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Never put a Supabase service-role key in the frontend.

## 5. GitHub
Push the project root (the folder containing `package.json`) to GitHub.

## 6. Vercel
Import the GitHub repository into Vercel.

Build command:
`npm run build`

Output directory:
`dist`

Add these Vercel environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Redeploy after adding environment variables.

## 7. First login / seed
The first authenticated management session will seed the application data into Supabase if the `pfs_records` table is empty. After that, data is persisted through Supabase instead of only localStorage.

## 8. Production notes
- Browser GPS requires HTTPS, which Vercel provides.
- Camera/selfie capture requires browser permission and HTTPS.
- Supervisor Employee-ID authentication uses an internal Supabase email alias; users never see or need to enter that email.
- The frontend uses only the Supabase anon key. Row Level Security is enabled for application records and selfie storage.
