-- FRAMEFORGE STUDIO — core schema
-- Designed to be applied via the Supabase CLI / migration system.

create extension if not exists pgcrypto;

-- ---------- workspaces ----------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- projects ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  aspect_ratio text not null default '16:9',
  width int not null default 1920,
  height int not null default 1080,
  fps int not null default 30,
  status text not null default 'draft' check (status in ('draft','rendering','archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- media ----------
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  kind text not null check (kind in ('video','audio','image')),
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  width int,
  height int,
  fps numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- timeline state (per project, jsonb snapshot) ----------
create table if not exists public.timeline_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  version integer not null default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- compositions (motion studio) ----------
create table if not exists public.compositions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  width int not null default 1920,
  height int not null default 1080,
  fps int not null default 30,
  duration numeric not null default 10,
  background_color text not null default '#0a0a0a',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- subtitle documents ----------
create table if not exists public.subtitle_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  language text not null default 'en',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- render jobs ----------
create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('export_video','export_audio','thumbnail','proxy')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  settings jsonb not null default '{}'::jsonb,
  progress numeric not null default 0,
  output_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- MCP API keys ----------
create table if not exists public.mcp_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- audit log ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index if not exists idx_projects_workspace on public.projects (workspace_id);
create index if not exists idx_projects_owner on public.projects (owner_id);
create index if not exists idx_media_owner on public.media_assets (owner_id);
create index if not exists idx_media_project on public.media_assets (project_id);
create index if not exists idx_media_workspace on public.media_assets (workspace_id);
create index if not exists idx_timeline_project on public.timeline_states (project_id);
create index if not exists idx_render_jobs_owner on public.render_jobs (owner_id);
create index if not exists idx_render_jobs_status on public.render_jobs (status);
create index if not exists idx_mcp_keys_owner on public.mcp_api_keys (owner_id);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_workspaces_updated on public.workspaces;
create trigger trg_workspaces_updated before update on public.workspaces
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists trg_media_updated on public.media_assets;
create trigger trg_media_updated before update on public.media_assets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_compositions_updated on public.compositions;
create trigger trg_compositions_updated before update on public.compositions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_subtitles_updated on public.subtitle_documents;
create trigger trg_subtitles_updated before update on public.subtitle_documents
  for each row execute function public.set_updated_at();

drop trigger if exists trg_render_jobs_updated on public.render_jobs;
create trigger trg_render_jobs_updated before update on public.render_jobs
  for each row execute function public.set_updated_at();

-- ---------- profile bootstrap on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security ----------
alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.media_assets enable row level security;
alter table public.timeline_states enable row level security;
alter table public.compositions enable row level security;
alter table public.subtitle_documents enable row level security;
alter table public.render_jobs enable row level security;
alter table public.mcp_api_keys enable row level security;
alter table public.audit_logs enable row level security;

-- owner-based policies (simplest safe model: the owning user sees their own data)
create policy workspaces_owner on public.workspaces
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy projects_owner on public.projects
  for all using (
    owner_id = auth.uid()
    or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
  ) with check (
    owner_id = auth.uid()
    or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
  );

create policy media_owner on public.media_assets
  for all using (
    owner_id = auth.uid()
    or (workspace_id is not null and exists (
      select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()
    ))
  ) with check (
    owner_id = auth.uid()
    or (workspace_id is not null and exists (
      select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()
    ))
  );

create policy timeline_owner on public.timeline_states
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

create policy comps_owner on public.compositions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy subtitles_owner on public.subtitle_documents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy render_owner on public.render_jobs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy mcp_keys_owner on public.mcp_api_keys
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy audit_owner on public.audit_logs
  for all using (actor_id = auth.uid()) with check (actor_id = auth.uid());

-- ---------- storage bucket ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- storage: users may read/write objects under their own folder prefix <uid>/
create policy media_storage_select on storage.objects
  for select using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy media_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy media_storage_update on storage.objects
  for update using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy media_storage_delete on storage.objects
  for delete using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );
