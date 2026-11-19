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
