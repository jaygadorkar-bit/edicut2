-- EdiCut's hosted data model for Supabase.
-- Auth identities live in auth.users; public.users is the application profile
-- table and intentionally keeps a nullable password_hash for legacy local data
-- during the migration window.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  phone varchar(32),
  country varchar(120),
  profile_image_url text,
  password_hash text,
  role text not null default 'user',
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  phone varchar(32),
  password_hash text not null,
  role text not null default 'admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  slug varchar(120) not null unique,
  title text not null,
  category varchar(80) not null,
  summary text not null,
  status varchar(32) not null default 'draft',
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  key varchar(120) not null unique,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  project_type varchar(120),
  monthly_volume varchar(120),
  message text not null,
  status varchar(32) not null default 'new',
  last_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects(owner_id);
create index if not exists projects_featured_sort_idx on public.projects(featured, sort_order);
create index if not exists contact_messages_status_created_idx on public.contact_messages(status, created_at desc);

alter table public.users enable row level security;
alter table public.admin_users enable row level security;
alter table public.projects enable row level security;
alter table public.site_settings enable row level security;
alter table public.contact_messages enable row level security;

revoke all on table public.admin_users from anon, authenticated;

grant select on table public.users to authenticated;
grant update on table public.users to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select on table public.site_settings to anon, authenticated;
grant insert on table public.contact_messages to anon, authenticated;

create policy "Users can read their own profile"
  on public.users for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.users for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Owners can read their projects"
  on public.projects for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can create their projects"
  on public.projects for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update their projects"
  on public.projects for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their projects"
  on public.projects for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Public can read site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

create policy "Anyone can submit a contact message"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);
