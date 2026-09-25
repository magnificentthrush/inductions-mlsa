-- Admin settings, the projector key, results, decisions and publishing.

create function public.set_decision(p_candidate_id uuid, p_decision public.candidate_decision) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ind uuid;
begin
  perform public.require_role('admin');
  v_ind := public.require_active_induction();
  if p_decision is null then
    raise exception 'Decision is required';
  end if;
  update public.candidates
     set decision = p_decision, updated_at = clock_timestamp()
   where id = p_candidate_id and induction_id = v_ind;
  if not found then
    raise exception 'Candidate not found';
  end if;
end $$;

create function public.set_results_published(p_published boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_role('admin');
  update public.inductions set results_published = coalesce(p_published, false) where is_active;
  if not found then
    raise exception 'No active induction';
  end if;
end $$;

create function public.get_display_key() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('admin');
  return (select display_key from public.inductions where is_active);
end $$;

create function public.regenerate_display_key() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text;
begin
  perform public.require_role('admin');
  update public.inductions
     set display_key = encode(extensions.gen_random_bytes(24), 'hex')
   where is_active
  returning display_key into v_key;
  if v_key is null then
    raise exception 'No active induction';
  end if;
  return v_key;
end $$;

create function public.update_settings(p_name text, p_target_minutes int) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_role('admin');
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Name must be 1 to 80 characters';
  end if;
  if p_target_minutes is null or p_target_minutes not between 1 and 180 then
    raise exception 'Target interview length must be 1 to 180 minutes';
  end if;
  update public.inductions
     set name = trim(p_name), target_interview_minutes = p_target_minutes
   where is_active;
  if not found then
    raise exception 'No active induction';
  end if;
  perform public.broadcast_board();
end $$;

-- Public page after inductions: selected candidates, name + reg number only.
create function public.published_results() returns table (full_name text, reg_number text)
language sql stable security definer set search_path = '' as $$
  select c.full_name, c.reg_number
    from public.candidates c
    join public.inductions i on i.id = c.induction_id
   where i.is_active and i.results_published and c.decision = 'selected'
   order by lower(c.full_name), c.reg_number
$$;

create function public.results_table() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ind uuid;
begin
  perform public.require_role('admin');
  v_ind := public.require_active_induction();
  return coalesce((
    with ev as (
      select i.candidate_id, e.scores, e.recommendation
        from public.evaluations e
        join public.interviews i on i.id = e.interview_id
       where i.induction_id = v_ind and i.status <> 'cancelled'
    ), scores as (
      select ev.candidate_id, s.key, (s.value)::numeric as val
        from ev
        cross join lateral jsonb_each(ev.scores) as s
       where jsonb_typeof(s.value) = 'number'
    ), per_criterion as (
      select x.candidate_id, jsonb_object_agg(x.key, x.avg) as avgs
        from (select candidate_id, key, round(avg(val), 2) as avg
                from scores group by candidate_id, key) x
       group by x.candidate_id
    ), general as (
      select sc.candidate_id, round(avg(sc.val), 2) as avg
        from scores sc
        join public.evaluation_criteria ec
          on ec.induction_id = v_ind and ec.key = sc.key and ec.category = 'general'
       group by sc.candidate_id
    ), tally as (
      select t.candidate_id, jsonb_object_agg(t.recommendation, t.n) as counts, sum(t.n)::int as total
        from (select candidate_id, recommendation::text as recommendation, count(*) as n
                from ev group by candidate_id, recommendation) t
       group by t.candidate_id
    )
    select jsonb_agg(jsonb_build_object(
             'candidate_id', c.id,
             'number', c.number,
             'reg_number', c.reg_number,
             'full_name', c.full_name,
             'department', c.department,
             'batch', c.batch,
             'preferences', to_jsonb(c.preferences),
             'status', c.status,
             'decision', c.decision,
             'evaluation_count', coalesce(tl.total, 0),
             'general_avg', g.avg,
             'criteria_avgs', coalesce(pc.avgs, '{}'::jsonb),
             'recommendations', coalesce(tl.counts, '{}'::jsonb))
           order by c.number)
      from public.candidates c
      left join per_criterion pc on pc.candidate_id = c.id
      left join general g on g.candidate_id = c.id
      left join tally tl on tl.candidate_id = c.id
     where c.induction_id = v_ind
  ), '[]'::jsonb);
end $$;

create function public.candidate_record(p_candidate_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ind uuid;
  v_result jsonb;
begin
  perform public.require_role('admin');
  v_ind := public.require_active_induction();
  select jsonb_build_object(
           'candidate', to_jsonb(c) - 'induction_id',
           'interviews', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', i.id,
                      'panel_name', p.name,
                      'status', i.status,
                      'started_at', i.started_at,
                      'ended_at', i.ended_at,
                      'messages', coalesce((
                        select jsonb_agg(public.message_json(m) order by m.created_at)
                          from public.messages m where m.interview_id = i.id), '[]'::jsonb),
                      'evaluations', coalesce((
                        select jsonb_agg(jsonb_build_object(
                                 'panelist_name', pr.display_name,
                                 'scores', e.scores,
                                 'recommendation', e.recommendation,
                                 'comments', e.comments,
                                 'submitted_at', e.submitted_at,
                                 'updated_at', e.updated_at)
                               order by pr.display_name)
                          from public.evaluations e
                          join public.profiles pr on pr.id = e.panelist_id
                         where e.interview_id = i.id), '[]'::jsonb))
                    order by i.started_at)
               from public.interviews i
               join public.panels p on p.id = i.panel_id
              where i.candidate_id = c.id), '[]'::jsonb))
    into v_result
    from public.candidates c
   where c.id = p_candidate_id and c.induction_id = v_ind;
  if v_result is null then
    raise exception 'Candidate not found';
  end if;
  return v_result;
end $$;

create function public.evaluations_export() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ind uuid;
begin
  perform public.require_role('admin');
  v_ind := public.require_active_induction();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'number', c.number,
             'reg_number', c.reg_number,
             'full_name', c.full_name,
             'panel', p.name,
             'panelist', pr.display_name,
             'scores', e.scores,
             'recommendation', e.recommendation,
             'comments', e.comments,
             'submitted_at', e.submitted_at)
           order by c.number, p.name, pr.display_name)
      from public.evaluations e
      join public.interviews i on i.id = e.interview_id
      join public.candidates c on c.id = i.candidate_id
      join public.panels p on p.id = i.panel_id
      join public.profiles pr on pr.id = e.panelist_id
     where i.induction_id = v_ind and i.status <> 'cancelled'), '[]'::jsonb);
end $$;

revoke execute on function public.set_decision(uuid, public.candidate_decision) from public, anon;
revoke execute on function public.set_results_published(boolean) from public, anon;
revoke execute on function public.get_display_key() from public, anon;
revoke execute on function public.regenerate_display_key() from public, anon;
revoke execute on function public.update_settings(text, int) from public, anon;
revoke execute on function public.results_table() from public, anon;
revoke execute on function public.candidate_record(uuid) from public, anon;
revoke execute on function public.evaluations_export() from public, anon;
grant execute on function public.set_decision(uuid, public.candidate_decision) to authenticated;
grant execute on function public.set_results_published(boolean) to authenticated;
grant execute on function public.get_display_key() to authenticated;
grant execute on function public.regenerate_display_key() to authenticated;
grant execute on function public.update_settings(text, int) to authenticated;
grant execute on function public.results_table() to authenticated;
grant execute on function public.candidate_record(uuid) to authenticated;
grant execute on function public.evaluations_export() to authenticated;
grant execute on function public.published_results() to anon, authenticated;
