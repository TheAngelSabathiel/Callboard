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
