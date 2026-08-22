-- Prime Field Supervisor - Supabase production schema
create extension if not exists pgcrypto;

create table if not exists public.pfs_records (
  entity text not null,
  record_id text not null,
  owner_key text,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (entity, record_id)
);

create or replace function public.is_management_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt()->>'email') not like '%@primefield.local', false);
$$;

alter table public.pfs_records enable row level security;

drop policy if exists pfs_records_select on public.pfs_records;
drop policy if exists pfs_records_insert on public.pfs_records;
drop policy if exists pfs_records_update on public.pfs_records;

create policy pfs_records_select on public.pfs_records
for select to authenticated
using (
  public.is_management_user()
  or owner_key is null
  or lower(owner_key) = lower(split_part(auth.jwt()->>'email','@',1))
);

create policy pfs_records_insert on public.pfs_records
for insert to authenticated
with check (
  public.is_management_user()
  or lower(owner_key) = lower(split_part(auth.jwt()->>'email','@',1))
);

create policy pfs_records_update on public.pfs_records
for update to authenticated
using (
  public.is_management_user()
  or lower(owner_key) = lower(split_part(auth.jwt()->>'email','@',1))
)
with check (
  public.is_management_user()
  or lower(owner_key) = lower(split_part(auth.jwt()->>'email','@',1))
);

create table if not exists public.pfs_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null default coalesce(auth.jwt()->>'email','unknown'),
  action text not null,
  entity text,
  record_id text,
  created_at timestamptz not null default now(),
  metadata jsonb
);
alter table public.pfs_audit_log enable row level security;
create policy pfs_audit_management on public.pfs_audit_log for all to authenticated using (public.is_management_user()) with check (public.is_management_user());

-- Storage bucket for clock-in/out selfies.
insert into storage.buckets (id, name, public) values ('pfs-selfies','pfs-selfies',false)
on conflict (id) do nothing;

drop policy if exists pfs_selfies_read on storage.objects;
drop policy if exists pfs_selfies_insert on storage.objects;
drop policy if exists pfs_selfies_update on storage.objects;
create policy pfs_selfies_read on storage.objects for select to authenticated using (bucket_id='pfs-selfies' and (public.is_management_user() or (name like lower(split_part(auth.jwt()->>'email','@',1)) || '/%')));
create policy pfs_selfies_insert on storage.objects for insert to authenticated with check (bucket_id='pfs-selfies' and (public.is_management_user() or (name like lower(split_part(auth.jwt()->>'email','@',1)) || '/%')));
create policy pfs_selfies_update on storage.objects for update to authenticated using (bucket_id='pfs-selfies' and (public.is_management_user() or (name like lower(split_part(auth.jwt()->>'email','@',1)) || '/%')));

-- IMPORTANT: Create Auth users in Supabase Authentication > Users.
-- Management example: admin@primegroupco.com
-- Supervisor example: pfs-sup-001@primefield.local
-- The supervisor's password is the password they use with Employee ID PFS-SUP-001.
