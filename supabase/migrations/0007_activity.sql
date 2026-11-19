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
