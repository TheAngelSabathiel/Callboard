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
