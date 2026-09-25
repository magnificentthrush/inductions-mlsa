begin;
select no_plan();

select tests.reset_app();
select tests.create_user('qm_one', 'queue_manager');
select tests.create_user('pan_one', 'panelist');
select tests.add_candidate(n) from generate_series(1, 5) as n;

-- Arrange a board directly: #1 interviewing on Panel 1, #2 lined up for Panel 1,
-- #3 and #4 in the pool, #5 still registered.
update public.candidates set status = 'interviewing' where number = 1;
update public.candidates set status = 'waiting', checked_in_at = now() where number in (2, 3, 4);
insert into public.interviews (induction_id, candidate_id, panel_id, status, started_at)
values (public.active_induction_id(), tests.candidate_id(1), tests.panel_id('Panel 1'), 'in_progress', '2026-09-26 10:00:00+05');
insert into public.queue_entries (candidate_id, induction_id, panel_id, position) values
  (tests.candidate_id(2), public.active_induction_id(), tests.panel_id('Panel 1'), 1),
  (tests.candidate_id(3), public.active_induction_id(), null, 1),
  (tests.candidate_id(4), public.active_induction_id(), null, 2);
update public.profiles set current_panel_id = tests.panel_id('Panel 1') where username = 'pan_one';

-- Projector snapshot
select is(public.display_snapshot('wrong-key'), null::jsonb, 'a wrong key returns nothing');

create temp table snap as select public.display_snapshot(tests.display_key()) as s;
select is((select jsonb_array_length(s -> 'panels') from snap), 2, 'both panels are shown');
select is((select s -> 'panels' -> 0 -> 'current' ->> 'number' from snap), '1', 'Panel 1 shows #1');
select is((select s -> 'panels' -> 0 -> 'current' ->> 'name' from snap), 'Candidate 1', 'with the name');
select is((select (s -> 'panels' -> 0 -> 'current' ->> 'started_at')::timestamptz from snap),
          '2026-09-26 10:00:00+05'::timestamptz, 'and the start time');
select is((select s -> 'panels' -> 0 -> 'lined_up' -> 0 ->> 'number' from snap), '2', '#2 is lined up for Panel 1');
select is((select s -> 'panels' -> 1 -> 'current' from snap), 'null'::jsonb, 'Panel 2 is free');
select is((select jsonb_path_query_array(s -> 'waiting', '$[*].number') from snap), '[3, 4]'::jsonb, 'pool in queue order');
select is((select (s ->> 'target_interview_minutes')::int from snap), 15, 'target length included');
select ok((select s::text !~ 'example\.test|0300000000' from snap), 'no email or phone reaches the projector');

select tests.logout();
select isnt(public.display_snapshot(tests.display_key()), null::jsonb, 'the anonymous projector loads its snapshot');
select throws_ok($$ select public.board_snapshot() $$, '42501', null, 'anonymous visitors cannot load the board');

-- Staff board snapshot
select tests.login_as('pan_one');
select is(public.board_snapshot() -> 'counts',
          '{"registered": 1, "waiting": 3, "interviewing": 1, "interviewed": 0}'::jsonb, 'counts by status');
select is(jsonb_path_query_array(public.board_snapshot() -> 'pool', '$[*].number'), '[3, 4]'::jsonb, 'pool in order');
select is(public.board_snapshot() -> 'panels' -> 0 -> 'current' ->> 'number', '1', 'current interview on Panel 1');
select is(jsonb_path_query_array(public.board_snapshot() -> 'panels' -> 0 -> 'lane', '$[*].number'), '[2]'::jsonb, 'Panel 1 lane');
select is(public.board_snapshot() -> 'panels' -> 0 -> 'panelists' -> 0 ->> 'display_name', 'Pan One', 'present panelists listed');
select is(public.board_snapshot() -> 'panels' -> 1 -> 'last_ended', 'null'::jsonb, 'nothing to reopen on Panel 2 yet');

-- Reopenable = the panel's latest non-cancelled interview, only while the panel is free
select tests.as_postgres();
insert into public.interviews (induction_id, candidate_id, panel_id, status, started_at, ended_at)
values (public.active_induction_id(), tests.candidate_id(5), tests.panel_id('Panel 2'), 'ended',
        '2026-09-26 09:00:00+05', '2026-09-26 09:15:00+05');
select is(public.panel_reopenable_interview(tests.panel_id('Panel 2')), tests.interview_id(5), 'latest ended interview is reopenable');
select is(public.panel_reopenable_interview(tests.panel_id('Panel 1')), null::uuid, 'a busy panel has nothing to reopen');

-- Clock and broadcasts
select ok(abs(extract(epoch from public.server_now() - clock_timestamp())) < 1, 'server_now is the current time');
select public.broadcast_board();
select ok(exists (select 1 from realtime.messages where topic = 'board' and event = 'changed' and private),
          'board change is broadcast privately');
select ok(exists (select 1 from realtime.messages
                   where topic = 'display:' || tests.display_key() and event = 'snapshot' and not private),
          'projector snapshot is broadcast publicly');

select * from finish();
rollback;
