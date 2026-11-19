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
