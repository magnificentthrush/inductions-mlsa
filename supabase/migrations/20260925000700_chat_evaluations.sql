-- Per-interview panel chat and per-panelist evaluations.

create function public.message_json(p_msg public.messages) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_msg.id,
    'interview_id', p_msg.interview_id,
    'author_id', p_msg.author_id,
    'author_name', (select display_name from public.profiles where id = p_msg.author_id),
    'body', p_msg.body,
    'created_at', p_msg.created_at)
$$;

-- p_id lets the client generate the id for optimistic display; retrying with the same id is safe.
create function public.post_message(p_interview_id uuid, p_body text, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_ind uuid;
  v_body text;
  v_msg public.messages;
  v_json jsonb;
begin
  v_uid := public.require_role('admin', 'panelist');
  v_ind := public.require_active_induction();
  if not exists (
    select 1 from public.interviews where id = p_interview_id and induction_id = v_ind and status <> 'cancelled'
  ) then
    raise exception 'Interview not found';
  end if;
  v_body := trim(coalesce(p_body, ''));
  if length(v_body) < 1 or length(v_body) > 2000 then
    raise exception 'Message must be 1 to 2000 characters';
  end if;

  insert into public.messages (id, interview_id, author_id, body, created_at)
  values (coalesce(p_id, gen_random_uuid()), p_interview_id, v_uid, v_body, clock_timestamp())
  on conflict (id) do nothing
  returning * into v_msg;

  if not found then
    select * into v_msg from public.messages where id = p_id;
    if v_msg.author_id <> v_uid or v_msg.interview_id <> p_interview_id then
      raise exception 'Message id already used';
    end if;
    return public.message_json(v_msg);
  end if;

  v_json := public.message_json(v_msg);
  perform public.broadcast_interview(p_interview_id, 'message', v_json);
  return v_json;
end $$;

create function public.interview_messages(p_interview_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('admin', 'panelist');
  return coalesce((
    select jsonb_agg(public.message_json(m) order by m.created_at)
      from public.messages m
     where m.interview_id = p_interview_id), '[]'::jsonb);
end $$;

create function public.submit_evaluation(
  p_interview_id uuid, p_scores jsonb, p_recommendation public.recommendation, p_comments text
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_ind public.inductions;
  v_bad text;
  v_count int;
begin
  v_uid := public.require_role('admin', 'panelist');
  select * into v_ind from public.inductions where is_active;
  if not found then
    raise exception 'No active induction';
  end if;
  if v_ind.results_published then
    raise exception 'Results are published; evaluations are locked';
  end if;
  if not exists (
    select 1 from public.interviews where id = p_interview_id and induction_id = v_ind.id and status <> 'cancelled'
  ) then
    raise exception 'Interview not found';
  end if;
  if p_recommendation is null then
    raise exception 'Recommendation is required';
  end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
    raise exception 'Scores must be an object';
  end if;

  select s.key into v_bad
    from jsonb_each(p_scores) as s
   where not exists (
           select 1 from public.evaluation_criteria ec where ec.induction_id = v_ind.id and ec.key = s.key)
      or not (jsonb_typeof(s.value) = 'null'
              or (jsonb_typeof(s.value) = 'number' and (s.value)::numeric in (1, 2, 3, 4, 5)))
   order by s.key
   limit 1;
  if v_bad is not null then
    raise exception 'Invalid score for %', v_bad;
  end if;
  if length(coalesce(p_comments, '')) > 5000 then
    raise exception 'Comments must be at most 5000 characters';
  end if;

  insert into public.evaluations (interview_id, panelist_id, scores, recommendation, comments, submitted_at, updated_at)
  values (p_interview_id, v_uid, jsonb_strip_nulls(p_scores), p_recommendation, trim(coalesce(p_comments, '')),
          clock_timestamp(), clock_timestamp())
  on conflict (interview_id, panelist_id) do update
    set scores = excluded.scores,
        recommendation = excluded.recommendation,
        comments = excluded.comments,
        updated_at = excluded.updated_at;

  select count(*) into v_count from public.evaluations where interview_id = p_interview_id;
  perform public.broadcast_interview(p_interview_id, 'evaluation', jsonb_build_object('count', v_count));
end $$;

-- Panelists cannot read each other's evaluation rows, so the count comes from here.
create function public.evaluation_count(p_interview_id uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('admin', 'panelist');
  return (select count(*)::int from public.evaluations where interview_id = p_interview_id);
end $$;

revoke execute on function public.message_json(public.messages) from public, anon, authenticated;
revoke execute on function public.post_message(uuid, text, uuid) from public, anon;
revoke execute on function public.interview_messages(uuid) from public, anon;
revoke execute on function public.submit_evaluation(uuid, jsonb, public.recommendation, text) from public, anon;
revoke execute on function public.evaluation_count(uuid) from public, anon;
grant execute on function public.post_message(uuid, text, uuid) to authenticated;
grant execute on function public.interview_messages(uuid) to authenticated;
grant execute on function public.submit_evaluation(uuid, jsonb, public.recommendation, text) to authenticated;
grant execute on function public.evaluation_count(uuid) to authenticated;
