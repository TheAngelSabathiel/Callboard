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
