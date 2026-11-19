-- =====================================================================
-- Callboard · initial database setup (migrations 0001–0008 combined)
-- Run ONCE in Supabase → SQL Editor on a NEW project.
-- Already set up? Run only the migrations you haven't run yet (latest: 0008_links.sql).
-- =====================================================================


-- >>>>>>>>>>>>>>>>>>>> 0001_foundation.sql
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


-- >>>>>>>>>>>>>>>>>>>> 0002_calendar_availability.sql
-- =====================================================================
-- Callboard · Phase 2 · Calendar, agenda, availability
-- =====================================================================

do $$ begin
  create type event_type as enum ('rehearsal','tech','dress','show','meeting','fitting','shoot','load_in','strike','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type availability_status as enum ('A','UN','TBD','PART');
exception when duplicate_object then null; end $$;

-- A calendar day item: rehearsal, tech, show, meeting...
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  call_time time,
  type event_type not null default 'rehearsal',
  title text not null default 'Rehearsal',
  venue text,
  notes text,            -- general notes for the day (shown on call sheet)
  reminders text,        -- e.g. "Bring tumblers. Practice CLAYGO."
  published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_prod_date_idx on public.events(production_id, date);
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- Agenda blocks inside an event: "6:00–7:30 PM · Unit 30–33 · Called: …"
create table if not exists public.event_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  production_id uuid not null references public.productions(id) on delete cascade,
  start_time time,
  end_time time,
  agenda text not null default '',
  scenes text,                      -- units / pages / french scenes
  called_ids uuid[] not null default '{}',   -- member ids
  called_all boolean not null default false, -- "All actors are called"
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists event_blocks_event_idx on public.event_blocks(event_id);
create index if not exists event_blocks_prod_idx on public.event_blocks(production_id);

-- Per-person, per-date availability
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  status availability_status not null,
  from_time time,   -- for PART: available only from..to
  to_time time,
  note text,
  updated_at timestamptz not null default now(),
  unique (member_id, date)
);
create index if not exists availability_prod_date_idx on public.availability(production_id, date);
create trigger availability_touch before update on public.availability
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;
alter table public.event_blocks enable row level security;
alter table public.availability enable row level security;

create policy "events read" on public.events for select using (public.is_member(production_id));
create policy "events write" on public.events for all
  using (public.can_edit(production_id)) with check (public.can_edit(production_id));

create policy "blocks read" on public.event_blocks for select using (public.is_member(production_id));
create policy "blocks write" on public.event_blocks for all
  using (public.can_edit(production_id)) with check (public.can_edit(production_id));

-- Everyone reads availability; SM team edits anyone's; each person edits their own.
create policy "availability read" on public.availability for select using (public.is_member(production_id));
create policy "availability insert" on public.availability for insert with check (
  public.can_edit(production_id) or member_id = public.my_member_id(production_id));
create policy "availability update" on public.availability for update using (
  public.can_edit(production_id) or member_id = public.my_member_id(production_id));
create policy "availability delete" on public.availability for delete using (
  public.can_edit(production_id) or member_id = public.my_member_id(production_id));

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.event_blocks;
alter publication supabase_realtime add table public.availability;


-- >>>>>>>>>>>>>>>>>>>> 0003_reports.sql
-- =====================================================================
-- Callboard · Phase 3 · SM reports (rehearsal, performance, tech, meeting)
-- Each department note is its own row so several SMs can edit at once.
-- =====================================================================

do $$ begin
  create type report_type as enum ('rehearsal','performance','tech','meeting');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present','late','absent','excused','not_called');
exception when duplicate_object then null; end $$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  type report_type not null default 'rehearsal',
  number int,
  date date not null,
  title text,
  venue text,
  start_time time,
  end_time time,
  agenda text,
  timings jsonb not null default '{}'::jsonb,   -- run times, house count, breaks
  prepared_by text,
  status text not null default 'draft' check (status in ('draft','final')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_prod_date_idx on public.reports(production_id, date desc);
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

create table if not exists public.report_sections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  production_id uuid not null references public.productions(id) on delete cascade,
  key text not null,
  title text not null,
  body text not null default '',
  needs_attention boolean not null default false,
  sort_order int not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists report_sections_report_idx on public.report_sections(report_id);

create or replace function public.sections_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;
create trigger report_sections_touch before update on public.report_sections
  for each row execute function public.sections_touch();

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  production_id uuid not null references public.productions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status attendance_status not null default 'present',
  arrival_time time,
  note text,
  unique (report_id, member_id)
);
create index if not exists attendance_report_idx on public.attendance(report_id);

alter table public.reports enable row level security;
alter table public.report_sections enable row level security;
alter table public.attendance enable row level security;

create policy "reports read" on public.reports for select using (public.is_member(production_id));
create policy "reports write" on public.reports for all
  using (public.can_edit(production_id)) with check (public.can_edit(production_id));
create policy "sections read" on public.report_sections for select using (public.is_member(production_id));
create policy "sections write" on public.report_sections for all
  using (public.can_edit(production_id)) with check (public.can_edit(production_id));
create policy "attendance read" on public.attendance for select using (public.is_member(production_id));
create policy "attendance write" on public.attendance for all
  using (public.can_edit(production_id)) with check (public.can_edit(production_id));

-- Default department sections per report type
create or replace function public.default_sections(t report_type)
returns table(key text, title text, sort_order int) language sql immutable as $$
  select k, ttl, ord::int from (
    select * from (values
      ('rehearsal','summary','Rehearsal Summary',1),
      ('rehearsal','schedule','Schedule / Time Breakdown',2),
      ('rehearsal','director','Director',3),
      ('rehearsal','script','Script / Text',4),
      ('rehearsal','set','Set',5),
      ('rehearsal','props','Props',6),
      ('rehearsal','costume','Costume',7),
      ('rehearsal','hmu','Hair & Makeup',8),
      ('rehearsal','lights','Lights',9),
      ('rehearsal','sound','Sound / Music',10),
      ('rehearsal','video','Video / Projection',11),
      ('rehearsal','movement','Choreography / Movement',12),
      ('rehearsal','production','Production / Management',13),
      ('rehearsal','venue','Venue / Facilities',14),
      ('rehearsal','next','Next Rehearsal · Schedules Given/Received',15),

      ('tech','summary','Tech Summary',1),
      ('tech','schedule','Schedule / Time Breakdown',2),
      ('tech','director','Director',3),
      ('tech','lights','Lights',4),
      ('tech','sound','Sound / Music',5),
      ('tech','video','Video / Projection',6),
      ('tech','set','Set / Rigging',7),
      ('tech','props','Props',8),
      ('tech','costume','Costume / Hair & Makeup',9),
      ('tech','deck','Deck / Crew',10),
      ('tech','production','Production / Management',11),
      ('tech','next','Next Call',12),

      ('performance','summary','Performance Notes',1),
      ('performance','house','House / Front of House',2),
      ('performance','cast','Cast',3),
      ('performance','lights','Lights',4),
      ('performance','sound','Sound / Music',5),
      ('performance','video','Video / Projection',6),
      ('performance','set','Set / Deck',7),
      ('performance','props','Props',8),
      ('performance','costume','Costume / Hair & Makeup',9),
      ('performance','incidents','Injuries / Incidents',10),
      ('performance','production','Production / Management',11),
      ('performance','next','Next Call',12),

      ('meeting','notes','General Meeting Notes',1),
      ('meeting','decisions','Decisions',2),
      ('meeting','actions','Action Items',3),
      ('meeting','schedules','Schedules Given/Received',4),
      ('meeting','next','Next Rehearsal Date',5)
    ) as v(tp, k, ttl, ord)
  ) x where x.tp = t::text order by ord;
$$;

-- Create a report with numbered sequence, default sections and attendance
create or replace function public.create_report(
  p_production uuid, p_type report_type, p_date date, p_event uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; n int; ev events%rowtype; prepared text;
begin
  if not public.can_edit(p_production) then raise exception 'Only the SM team can create reports'; end if;
  select coalesce(max(number),0) + 1 into n from reports where production_id = p_production and type = p_type;
  select display_name into prepared from members where production_id = p_production and user_id = auth.uid() limit 1;
  if p_event is not null then select * into ev from events where id = p_event and production_id = p_production; end if;

  insert into reports (production_id, event_id, type, number, date, title, venue, start_time, end_time, prepared_by, created_by)
  values (p_production, p_event, p_type, n, p_date, ev.title, ev.venue, ev.start_time, ev.end_time, prepared, auth.uid())
  returning id into rid;

  insert into report_sections (report_id, production_id, key, title, sort_order)
  select rid, p_production, d.key, d.title, d.sort_order from public.default_sections(p_type) d;

  -- Pre-fill attendance with everyone called on the linked event
  if p_event is not null then
    insert into attendance (report_id, production_id, member_id, status)
    select distinct rid, p_production, mid, 'present'::attendance_status from (
      select unnest(called_ids) as mid from event_blocks where event_id = p_event
      union
      select m.id from event_blocks b join members m on m.production_id = p_production
        and (m.role = 'actor' or m.department = 'Cast')
      where b.event_id = p_event and b.called_all
    ) s where mid is not null
    on conflict do nothing;

    -- Schedule section from the agenda
    update report_sections set body = coalesce((
      select string_agg(
        coalesce(to_char(date '2000-01-01' + b.start_time,'FMHH12:MI AM'),'') ||
        case when b.end_time is not null then ' - ' || to_char(date '2000-01-01' + b.end_time,'FMHH12:MI AM') else '' end ||
        ': ' || b.agenda || coalesce(' (' || b.scenes || ')',''), E'\n' order by b.sort_order, b.start_time)
      from event_blocks b where b.event_id = p_event), '')
    where report_id = rid and key = 'schedule';
  end if;
  return rid;
end $$;

alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.report_sections;
alter publication supabase_realtime add table public.attendance;


-- >>>>>>>>>>>>>>>>>>>> 0004_script_cues_breakdown.sql
-- =====================================================================
-- Callboard · Phase 4 · Script, blocking & markings, cues, scene breakdown
-- =====================================================================

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  title text not null default 'Script',
  version text,
  is_current boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists scripts_prod_idx on public.scripts(production_id);

-- One row per script line, in order (idx)
create table if not exists public.script_lines (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  production_id uuid not null references public.productions(id) on delete cascade,
  idx int not null,
  page int not null default 1,
  act text,
  scene text,
  kind text not null default 'dialogue' check (kind in ('dialogue','direction','heading','character','blank')),
  speaker text,
  text text not null default '',
  unique (script_id, idx)
);
create index if not exists script_lines_script_idx on public.script_lines(script_id, idx);
create index if not exists script_lines_page_idx on public.script_lines(script_id, page);

-- Blocking, notes, highlights and text changes anchored to a line
create table if not exists public.script_marks (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  production_id uuid not null references public.productions(id) on delete cascade,
  line_id uuid not null references public.script_lines(id) on delete cascade,
  type text not null check (type in ('blocking','note','highlight','line_change')),
  text text,
  color text,
  char_start int,
  char_end int,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists script_marks_script_idx on public.script_marks(script_id);

-- Cues (LX, SQ, VQ, FLY, SPOT, DECK, PROJ …) optionally anchored to a script line
create table if not exists public.cues (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  script_id uuid references public.scripts(id) on delete set null,
  line_id uuid references public.script_lines(id) on delete set null,
  standby_line_id uuid references public.script_lines(id) on delete set null,
  dept text not null default 'LX',
  number text not null default '',
  page text,
  act text,
  scene text,
  trigger text,          -- GO point: line / visual / sound
  description text,
  duration text,         -- fade / count
  notes text,
  sort_key numeric not null default 0,
  status text not null default 'draft' check (status in ('draft','set','cut')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cues_prod_idx on public.cues(production_id, sort_key);
create trigger cues_touch before update on public.cues
  for each row execute function public.touch_updated_at();

-- French scene / unit breakdown (mirrors the Sequence Breakdown sheet)
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  act text,
  unit text,
  french_scene text,
  page text,
  setting text,
  characters text,     -- comma separated character names
  entrances text,
  exits text,
  props text,
  set_notes text,
  sound text,
  lights text,
  video text,
  costume text,
  movement text,
  remarks text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scenes_prod_idx on public.scenes(production_id, sort_order);
create trigger scenes_touch before update on public.scenes
  for each row execute function public.touch_updated_at();

alter table public.scripts enable row level security;
alter table public.script_lines enable row level security;
alter table public.script_marks enable row level security;
alter table public.cues enable row level security;
alter table public.scenes enable row level security;

create policy "scripts read" on public.scripts for select using (public.is_member(production_id));
create policy "scripts write" on public.scripts for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));
create policy "lines read" on public.script_lines for select using (public.is_member(production_id));
create policy "lines write" on public.script_lines for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));
create policy "marks read" on public.script_marks for select using (public.is_member(production_id));
create policy "marks write" on public.script_marks for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));
create policy "cues read" on public.cues for select using (public.is_member(production_id));
create policy "cues write" on public.cues for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));
create policy "scenes read" on public.scenes for select using (public.is_member(production_id));
create policy "scenes write" on public.scenes for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));

-- Only one current script per production
create or replace function public.scripts_single_current()
returns trigger language plpgsql as $$
begin
  if new.is_current then
    update scripts set is_current = false where production_id = new.production_id and id <> new.id and is_current;
  end if;
  return new;
end $$;
create trigger scripts_current after insert or update of is_current on public.scripts
  for each row when (new.is_current) execute function public.scripts_single_current();

alter publication supabase_realtime add table public.script_marks;
alter publication supabase_realtime add table public.cues;
alter publication supabase_realtime add table public.scenes;

-- Insert a line after a given index, shifting the rest down (keeps idx unique).
create or replace function public.script_insert_line(
  p_script uuid, p_after int, p_text text, p_kind text default 'dialogue', p_speaker text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; ref script_lines%rowtype; new_id uuid;
begin
  select production_id into pid from scripts where id = p_script;
  if pid is null or not public.can_edit(pid) then raise exception 'Not allowed'; end if;
  select * into ref from script_lines where script_id = p_script and idx = p_after;
  update script_lines set idx = -(idx + 1) where script_id = p_script and idx > p_after;
  update script_lines set idx = -idx where script_id = p_script and idx < 0;
  insert into script_lines (script_id, production_id, idx, page, act, scene, kind, speaker, text)
  values (p_script, pid, p_after + 1, coalesce(ref.page, 1), ref.act, ref.scene, p_kind, p_speaker, p_text)
  returning id into new_id;
  return new_id;
end $$;


-- >>>>>>>>>>>>>>>>>>>> 0005_props_linenotes.sql
-- =====================================================================
-- Callboard · Phase 6 · Props tracker, line notes
-- =====================================================================

create table if not exists public.props (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  name text not null default '',
  category text,         -- hand prop, set prop, consumable, set dressing…
  scene text,            -- where used (unit / pages)
  character text,        -- who handles it
  preset text,           -- preset location: SL table, SR table, on set…
  source text,           -- borrowed, bought, built, rented, stock
  status text,           -- needed, sourcing, rehearsal, show-ready, repair
  quantity int,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists props_prod_idx on public.props(production_id, sort_order);
create trigger props_touch before update on public.props
  for each row execute function public.touch_updated_at();

create table if not exists public.line_notes (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  date date not null default current_date,
  character text,
  member_id uuid references public.members(id) on delete set null,
  page text,
  line text,             -- the line as written in the script
  issue text,            -- dropped, paraphrased, jumped, called line, wrong word, added, order
  note text,             -- what was said instead
  sent boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists line_notes_prod_idx on public.line_notes(production_id, date);

alter table public.props enable row level security;
alter table public.line_notes enable row level security;

create policy "props read" on public.props for select using (public.is_member(production_id));
create policy "props write" on public.props for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));
create policy "line notes read" on public.line_notes for select using (public.is_member(production_id));
create policy "line notes write" on public.line_notes for all using (public.can_edit(production_id)) with check (public.can_edit(production_id));

alter publication supabase_realtime add table public.props;
alter publication supabase_realtime add table public.line_notes;

-- Live roster updates in open sessions
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.characters;


-- >>>>>>>>>>>>>>>>>>>> 0006_reuse_safety.sql
-- =====================================================================
-- Callboard · Phase 7 · Reuse across productions + safety fixes
--  * duplicate_production(): start a new show from an existing one
--  * members can leave a production; the last Head SM can't be removed/demoted
-- =====================================================================

-- ---------- Leave a production (non-Head members delete their own row) ----------
drop policy if exists "members leave" on public.members;
create policy "members leave" on public.members
  for delete using (user_id = auth.uid() and role <> 'head_sm');

-- ---------- Always keep at least one linked Head SM ----------
create or replace function public.keep_one_head()
returns trigger language plpgsql security definer set search_path = public as $$
declare remaining int;
begin
  if (tg_op = 'DELETE' and old.role = 'head_sm')
     or (tg_op = 'UPDATE' and old.role = 'head_sm' and new.role <> 'head_sm') then
    -- allow when the whole production is being deleted
    if not exists (select 1 from productions where id = old.production_id) then
      return coalesce(new, old);
    end if;
    select count(*) into remaining from members
      where production_id = old.production_id and role = 'head_sm' and user_id is not null and id <> old.id;
    if remaining = 0 then
      raise exception 'A production needs at least one Head SM with an account. Promote someone else first.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists members_keep_head on public.members;
create trigger members_keep_head before update of role or delete on public.members
  for each row execute function public.keep_one_head();

-- ---------- Start a new production from an existing one ----------
-- p_company: 'none' | 'team' (SM team, director, PM, designers, crew) | 'all'
create or replace function public.duplicate_production(
  p_src uuid,
  p_title text,
  p_company text default 'team',
  p_cast boolean default false,
  p_breakdown boolean default false,
  p_props boolean default false,
  p_script boolean default false,
  p_cues boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  src productions%rowtype;
  pid uuid;
  s scripts%rowtype;
  new_sid uuid;
begin
  if not public.is_member(p_src) then raise exception 'Not a member of the source production'; end if;
  select * into src from productions where id = p_src;

  pid := public.create_production(p_title, src.produced_by, src.directed_by, src.venue, null);
  update productions set subtitle = src.subtitle, rehearsal_venue = src.rehearsal_venue,
    script_version = src.script_version, accent_color = src.accent_color
  where id = pid;

  -- member id map (old → new)
  create temp table if not exists _mmap (old_id uuid primary key, new_id uuid) on commit drop;
  delete from _mmap;

  -- the caller already exists as Head SM in the new production
  insert into _mmap select m.id, n.id from members m join members n on n.production_id = pid and n.user_id = auth.uid()
    where m.production_id = p_src and m.user_id = auth.uid();

  if p_company <> 'none' then
    with src_m as (
      select m.* from members m
      where m.production_id = p_src
        and (m.user_id is distinct from auth.uid())
        and (p_company = 'all' or m.role in ('head_sm','sm','asm','director','production_manager','designer','crew'))
    ), ins as (
      insert into members (production_id, user_id, role, display_name, position, department, email, phone, notes, sort_order)
      select pid, user_id, role, display_name, position, department, email, phone, notes, sort_order from src_m
      returning id, display_name, coalesce(user_id::text, '') as uk, sort_order
    )
    insert into _mmap
    select sm.id, ins.id from src_m sm join ins
      on ins.display_name = sm.display_name and ins.uk = coalesce(sm.user_id::text, '') and ins.sort_order = sm.sort_order
    on conflict do nothing;
  end if;

  if p_cast then
    insert into characters (production_id, name, description, actor_id, alternate_id, sort_order)
    select pid, c.name, c.description, a.new_id, b.new_id, c.sort_order
    from characters c
    left join _mmap a on a.old_id = c.actor_id
    left join _mmap b on b.old_id = c.alternate_id
    where c.production_id = p_src;
  end if;

  if p_breakdown then
    insert into scenes (production_id, act, unit, french_scene, page, setting, characters, entrances, exits, props,
      set_notes, sound, lights, video, costume, movement, remarks, sort_order)
    select pid, act, unit, french_scene, page, setting, characters, entrances, exits, props,
      set_notes, sound, lights, video, costume, movement, remarks, sort_order
    from scenes where production_id = p_src;
  end if;

  if p_props then
    insert into props (production_id, name, category, scene, character, preset, source, status, quantity, notes, sort_order)
    select pid, name, category, scene, character, preset, source, 'Needed', quantity, notes, sort_order
    from props where production_id = p_src;
  end if;

  if p_script then
    select * into s from scripts where production_id = p_src and is_current order by created_at desc limit 1;
    if s.id is not null then
      insert into scripts (production_id, title, version, is_current, created_by)
      values (pid, s.title, s.version, true, auth.uid()) returning id into new_sid;

      insert into script_lines (script_id, production_id, idx, page, act, scene, kind, speaker, text)
      select new_sid, pid, idx, page, act, scene, kind, speaker, text from script_lines where script_id = s.id;

      insert into script_marks (script_id, production_id, line_id, type, text, color, char_start, char_end, created_by)
      select new_sid, pid, nl.id, mk.type, mk.text, mk.color, mk.char_start, mk.char_end, auth.uid()
      from script_marks mk
      join script_lines ol on ol.id = mk.line_id
      join script_lines nl on nl.script_id = new_sid and nl.idx = ol.idx
      where mk.script_id = s.id;

      if p_cues then
        insert into cues (production_id, script_id, line_id, standby_line_id, dept, number, page, act, scene,
          trigger, description, duration, notes, sort_key, status)
        select pid, new_sid, nl.id, ns.id, c.dept, c.number, c.page, c.act, c.scene,
          c.trigger, c.description, c.duration, c.notes, c.sort_key, c.status
        from cues c
        left join script_lines ol on ol.id = c.line_id
        left join script_lines nl on nl.script_id = new_sid and nl.idx = ol.idx
        left join script_lines osb on osb.id = c.standby_line_id
        left join script_lines ns on ns.script_id = new_sid and ns.idx = osb.idx
        where c.production_id = p_src;
      end if;
    end if;
  elsif p_cues then
    insert into cues (production_id, dept, number, page, act, scene, trigger, description, duration, notes, sort_key, status)
    select pid, dept, number, page, act, scene, trigger, description, duration, notes, sort_key, status
    from cues where production_id = p_src;
  end if;

  return pid;
end $$;


-- >>>>>>>>>>>>>>>>>>>> 0007_activity.sql
-- =====================================================================
-- Callboard · Phase 8 · Activity feed (notifications for create / edit / delete)
-- Every change to production data is logged by a trigger, so teammates get a
-- notification even if the change came from another device. Bursts are merged:
-- repeated edits to the same row, or many inserts/deletes in a row by the same
-- person, update one entry instead of flooding the feed.
-- =====================================================================

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  user_id uuid,
  actor_name text,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('insert','update','delete')),
  label text,
  count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activity_prod_idx on public.activity(production_id, updated_at desc);

alter table public.activity enable row level security;
drop policy if exists "activity read" on public.activity;
create policy "activity read" on public.activity for select using (public.is_member(production_id));
-- no insert/update/delete policies: only the trigger (security definer) writes

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  pid uuid;
  rid uuid;
  lbl text;
  who text;
  act text := lower(tg_op);
  recent uuid;
begin
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  pid := (r->>'production_id')::uuid;
  rid := (r->>'id')::uuid;
  if pid is null or auth.uid() is null then return null; end if;
  -- production being deleted (cascade): nothing to log
  if not exists (select 1 from productions where id = pid) then return null; end if;

  -- ignore no-op updates
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return null;
  end if;

  lbl := left(coalesce(
    r->>'title', r->>'name', r->>'display_name', nullif(r->>'agenda',''),
    case when r ? 'dept' then trim(coalesce(r->>'dept','') || ' ' || coalesce(r->>'number','')) end,
    r->>'text', r->>'character', r->>'french_scene', r->>'unit', r->>'date'
  ), 120);

  select display_name into who from members where production_id = pid and user_id = auth.uid() limit 1;

  if act = 'update' then
    select id into recent from activity
      where production_id = pid and user_id = auth.uid() and table_name = tg_table_name
        and row_id = rid and action = 'update' and updated_at > now() - interval '3 minutes'
      order by updated_at desc limit 1;
  else
    select id into recent from activity
      where production_id = pid and user_id = auth.uid() and table_name = tg_table_name
        and action = act and updated_at > now() - interval '20 seconds'
      order by updated_at desc limit 1;
  end if;

  if recent is not null then
    update activity set updated_at = now(),
      count = case when act = 'update' then count else count + 1 end,
      label = case when act = 'update' then lbl else label end
    where id = recent;
  else
    insert into activity (production_id, user_id, actor_name, table_name, row_id, action, label)
    values (pid, auth.uid(), coalesce(who, 'Someone'), tg_table_name, rid, act, lbl);
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tasks','members','characters','events','event_blocks','availability','reports',
    'report_sections','attendance','scripts','script_marks','cues','scenes','props','line_notes']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_activity', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()', t || '_activity', t);
  end loop;
end $$;

-- keep the feed small: entries older than 60 days are removed when new ones arrive (cheap, occasional)
create or replace function public.prune_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if random() < 0.02 then
    delete from activity where production_id = new.production_id and updated_at < now() - interval '60 days';
  end if;
  return null;
end $$;
drop trigger if exists activity_prune on public.activity;
create trigger activity_prune after insert on public.activity for each row execute function public.prune_activity();

alter publication supabase_realtime add table public.activity;


-- >>>>>>>>>>>>>>>>>>>> 0008_links.sql
-- =====================================================================
-- Callboard · Phase 11 · Links & media hub
-- One place for every video, reference, Drive folder, playlist or doc of the show.
-- =====================================================================

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  title text not null default '',
  url text not null,
  category text not null default 'Reference',   -- Rehearsal video, Reference, Music, Design, Script, Drive folder, Admin, Other
  scene text,                                   -- related unit / page / scene (optional)
  department text,
  notes text,
  pinned boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists links_prod_idx on public.links(production_id, pinned desc, created_at desc);
drop trigger if exists links_touch on public.links;
create trigger links_touch before update on public.links
  for each row execute function public.touch_updated_at();

alter table public.links enable row level security;
drop policy if exists "links read" on public.links;
drop policy if exists "links insert" on public.links;
drop policy if exists "links update" on public.links;
drop policy if exists "links delete" on public.links;
-- Everyone on the production can read and add links (designers, director, cast share references).
create policy "links read" on public.links for select using (public.is_member(production_id));
create policy "links insert" on public.links for insert with check (public.is_member(production_id) and created_by = auth.uid());
-- SM team edits/deletes any link; others only their own.
create policy "links update" on public.links for update using (public.can_edit(production_id) or created_by = auth.uid());
create policy "links delete" on public.links for delete using (public.can_edit(production_id) or created_by = auth.uid());

-- notifications / activity feed
drop trigger if exists links_activity on public.links;
create trigger links_activity after insert or update or delete on public.links
  for each row execute function public.log_activity();

alter publication supabase_realtime add table public.links;
