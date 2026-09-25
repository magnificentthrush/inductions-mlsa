-- Panels: Panel 1 and Panel 2 are defaults (admin-only delete). Extra panels can be added on the
-- day by the queue manager. Deleting is a soft delete so past interviews keep their panel.

create function public.add_panel() returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_ind uuid;
  v_n int;
  v_order int;
  v_id uuid;
begin
  v_uid := public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select count(*) + 1, coalesce(max(sort_order), 0) + 1 into v_n, v_order
    from public.panels where induction_id = v_ind;
  insert into public.panels (induction_id, name, is_default, sort_order, created_by)
  values (v_ind, 'Panel ' || v_n, false, v_order, v_uid)
  returning id into v_id;
  perform public.broadcast_board();
  return v_id;
end $$;

create function public.delete_panel(p_panel_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_p public.panels;
  v_base int;
begin
  perform public.require_role('admin', 'queue_manager');
  v_ind := public.require_active_induction();
  perform public.lock_queue(v_ind);
  select * into v_p from public.panels
   where id = p_panel_id and induction_id = v_ind and deleted_at is null for update;
  if not found then
    raise exception 'Panel not found';
  end if;
  if v_p.is_default and public.current_app_role() <> 'admin' then
    raise exception 'Only an admin can delete %', v_p.name;
  end if;
  if exists (select 1 from public.interviews where panel_id = v_p.id and status = 'in_progress') then
    raise exception '% has an interview in progress', v_p.name;
  end if;

  -- Its lane (positions 1..k) goes to the end of the pool in the same order.
  v_base := public.lane_next_position(v_ind, null) - 1;
  update public.queue_entries
     set panel_id = null, position = v_base + position
   where induction_id = v_ind and panel_id = v_p.id;

  update public.panels set deleted_at = clock_timestamp() where id = v_p.id;
  update public.profiles set current_panel_id = null where current_panel_id = v_p.id;
  perform public.broadcast_board();
end $$;

-- Panelists pick the room they are sitting in (null = none).
create function public.set_my_panel(p_panel_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_ind uuid;
begin
  v_uid := public.require_role('admin', 'panelist');
  v_ind := public.require_active_induction();
  if p_panel_id is not null and not exists (
    select 1 from public.panels where id = p_panel_id and induction_id = v_ind and deleted_at is null
  ) then
    raise exception 'Panel not found';
  end if;
  update public.profiles set current_panel_id = p_panel_id where id = v_uid;
  perform public.broadcast_board();
end $$;

revoke execute on function public.add_panel() from public, anon;
revoke execute on function public.delete_panel(uuid) from public, anon;
revoke execute on function public.set_my_panel(uuid) from public, anon;
grant execute on function public.add_panel() to authenticated;
grant execute on function public.delete_panel(uuid) to authenticated;
grant execute on function public.set_my_panel(uuid) to authenticated;
