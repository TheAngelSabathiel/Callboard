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
