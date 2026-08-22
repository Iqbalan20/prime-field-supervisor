# Prime Field Supervisor

Production-ready Vite/React field-supervisor application prepared for **GitHub + Vercel + Supabase**.

## Features
- Separate Management and Supervisor login
- Management: email/password
- Supervisor: Employee ID/password
- Supabase Auth + PostgreSQL persistence
- Row Level Security for supervisor-owned records
- Clock in/out with live GPS + selfie
- Company-location/geofence verification
- Clock-out blocked until daily report is submitted
- Supervisor attendance and working hours
- Current requirements/openings
- Daily reports
- ESIC & EPF records
- Management live location/performance dashboards
- Vercel deployment configuration

## Local

```bash
npm install
npm run build
npm run dev
```

Configure `.env.local` from `.env.example`.

## Supabase
Run `supabase/schema.sql` in the Supabase SQL Editor, then follow `SUPABASE_SETUP.md` to create Authentication users and configure Vercel.
