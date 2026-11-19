-- =====================================================================
-- Callboard · Phase 1 · Foundation
-- Accounts, productions, company directory (members), characters, tasks
-- Run in Supabase SQL editor (or `supabase db push`) in numeric order.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type member_role as enum (
    'head_sm','sm','asm','director','production_manager','designer','crew','actor','viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('todo','in_progress','blocked','done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

-- ---------- Helpers ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- Productions ----------
create table if not exists public.productions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  produced_by text,
  directed_by text,
  venue text,
  rehearsal_venue text,
  show_dates text,
  first_rehearsal date,
  opening_date date,
  closing_date date,
  script_version text,
  accent_color text default '#c2410c',
  archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger productions_touch before update on public.productions
  for each row execute function public.touch_updated_at();

-- ---------- Members (company directory + app access) ----------
-- A member can exist without an account (contact only). When someone signs up
-- with the same email they are linked automatically.
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role member_role not null default 'viewer',
  display_name text not null,
  position text,            -- e.g. "Director & Producer", "Lights Designer"
  department text,          -- e.g. "Stage Management", "Cast", "Lights"
  email text,
  phone text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_id, user_id)
);
create index if not exists members_production_idx on public.members(production_id);
create index if not exists members_user_idx on public.members(user_id);
create index if not exists members_email_idx on public.members(lower(email));
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- ---------- Characters (roles in the play) ----------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  name text not null,
  description text,
  actor_id uuid references public.members(id) on delete set null,
  alternate_id uuid references public.members(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists characters_production_idx on public.characters(production_id);

-- ---------- Tasks ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  title text not null,
  description text,
  department text,
  assignee_id uuid references public.members(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  due_date date,
  status task_status not null default 'todo',
  priority task_priority not null default 'normal',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_production_idx on public.tasks(production_id);
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

create or replace function public.tasks_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at = now();
  elsif new.status <> 'done' then
    new.completed_at = null;
  end if;
  return new;
end $$;
create trigger tasks_done before update on public.tasks
  for each row execute function public.tasks_completed_at();

-- ---------- Permission helpers (security definer avoids RLS recursion) ----------
create or replace function public.is_member(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from members where production_id = pid and user_id = auth.uid());
$$;

create or replace function public.my_role(pid uuid)
returns member_role language sql stable security definer set search_path = public as $$
  select role from members where production_id = pid and user_id = auth.uid() limit 1;
$$;

create or replace function public.is_head(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(pid) = 'head_sm', false);
$$;

-- Stage management team (Head SM, SM, ASM) can edit operational data.
create or replace function public.can_edit(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(pid) in ('head_sm','sm','asm'), false);
$$;

create or replace function public.my_member_id(pid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from members where production_id = pid and user_id = auth.uid() limit 1;
$$;

create or replace function public.shares_production(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from members a join members b on a.production_id = b.production_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------- Auth hooks ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  -- Link pending invitations (members added by email before sign-up)
  update members m set user_id = new.id
  where m.user_id is null and lower(m.email) = lower(new.email)
    and not exists (select 1 from members x where x.production_id = m.production_id and x.user_id = new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Link a member to an existing account when added by email
create or replace function public.members_link_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if new.user_id is null and new.email is not null and length(trim(new.email)) > 0 then
    select id into uid from profiles where lower(email) = lower(trim(new.email)) limit 1;
    if uid is not null and not exists (
      select 1 from members where production_id = new.production_id and user_id = uid and id <> new.id
    ) then
      new.user_id = uid;
    end if;
  end if;
  return new;
end $$;
create trigger members_link before insert or update of email on public.members
  for each row execute function public.members_link_user();

-- Create a production and make the caller its Head SM, atomically.
create or replace function public.create_production(
  p_title text, p_produced_by text default null, p_directed_by text default null,
  p_venue text default null, p_show_dates text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; prof profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into productions (title, produced_by, directed_by, venue, show_dates, created_by)
  values (p_title, p_produced_by, p_directed_by, p_venue, p_show_dates, auth.uid())
  returning id into pid;

  select * into prof from profiles where id = auth.uid();
  insert into members (production_id, user_id, role, display_name, position, department, email, phone, sort_order)
  values (pid, auth.uid(), 'head_sm', coalesce(prof.full_name, prof.email, 'Head SM'),
          'Head Stage Manager', 'Stage Management', prof.email, prof.phone, 0);
  return pid;
end $$;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.productions enable row level security;
alter table public.members enable row level security;
alter table public.characters enable row level security;
alter table public.tasks enable row level security;

create policy "profiles read self or co-members" on public.profiles
  for select using (id = auth.uid() or public.shares_production(id));
create policy "profiles update self" on public.profiles
  for update using (id = auth.uid());

create policy "productions read members" on public.productions
  for select using (public.is_member(id));
create policy "productions update head" on public.productions
  for update using (public.is_head(id));
create policy "productions delete head" on public.productions
  for delete using (public.is_head(id));

create policy "members read" on public.members
  for select using (public.is_member(production_id));
create policy "members write head" on public.members
  for insert with check (public.is_head(production_id));
create policy "members update head" on public.members
  for update using (public.is_head(production_id));
create policy "members delete head" on public.members
  for delete using (public.is_head(production_id));

create policy "characters read" on public.characters
  for select using (public.is_member(production_id));
create policy "characters write sm" on public.characters
  for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));

create policy "tasks read" on public.tasks
  for select using (public.is_member(production_id));
-- Head SM assigns to anyone. SM/ASM may log tasks for themselves or unassigned.
create policy "tasks insert" on public.tasks
  for insert with check (
    public.is_head(production_id)
    or (public.can_edit(production_id) and (assignee_id is null or assignee_id = public.my_member_id(production_id)))
  );
-- Head SM edits any task; assignees update their own (status, notes).
create policy "tasks update" on public.tasks
  for update using (
    public.is_head(production_id) or assignee_id = public.my_member_id(production_id)
    or (created_by = auth.uid() and public.can_edit(production_id))
  );
create policy "tasks delete" on public.tasks
  for delete using (public.is_head(production_id) or created_by = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.tasks;
