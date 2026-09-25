begin;
select no_plan();

select tests.reset_app();
select tests.create_user('qm_one', 'queue_manager');
select tests.create_user('pan_one', 'panelist');
select tests.add_candidate(n) from generate_series(1, 4) as n;

-- only the queue manager and admins run queue actions
select tests.login_as('pan_one');
select throws_ok($$ select public.check_in(tests.candidate_id(1)) $$, '42501', 'Not allowed', 'panelists cannot check candidates in');

-- check-in joins the end of the pool
select tests.login_as('qm_one');
select lives_ok($$ select public.check_in(tests.candidate_id(1)) $$, 'check in #1');
select public.check_in(tests.candidate_id(2));
select public.check_in(tests.candidate_id(3));
select is(tests.status(1), 'waiting', 'checked-in candidate is waiting');
select ok((select checked_in_at is not null from public.candidates where number = 1), 'check-in time recorded');
select is(tests.lane(), array[1, 2, 3], 'check-ins join the end of the pool');
select throws_ok($$ select public.check_in(tests.candidate_id(1)) $$, 'P0001', 'Candidate #1 is already waiting', 'cannot check in twice');

-- emergency: move to the top of the pool
select public.move_candidate(tests.candidate_id(3), null, 1);
select is(tests.lane(), array[3, 1, 2], '#3 moved to the top of the pool');

-- line up for a panel, insert ahead, clamp past the end
select public.move_candidate(tests.candidate_id(1), tests.panel_id('Panel 1'), null);
select is(tests.lane('Panel 1'), array[1], '#1 lined up for Panel 1');
select is(tests.lane(), array[3, 2], 'the pool closes the gap');
select public.move_candidate(tests.candidate_id(2), tests.panel_id('Panel 1'), 1);
select is(tests.lane('Panel 1'), array[2, 1], '#2 inserted ahead of #1');
select public.move_candidate(tests.candidate_id(3), tests.panel_id('Panel 1'), 99);
select is(tests.lane('Panel 1'), array[2, 1, 3], 'positions past the end clamp to the end');
select ok(tests.lanes_are_contiguous(), 'positions stay 1..n in every lane');

-- skip: to the end of the same lane, counted, still waiting
select public.skip_candidate(tests.candidate_id(2));
select is(tests.lane('Panel 1'), array[1, 3, 2], '#2 skipped to the end');
select is((select skip_count from public.queue_entries where candidate_id = tests.candidate_id(2)), 1, 'skip is counted');
select is(tests.status(2), 'waiting', 'a skipped candidate is still waiting');

-- back to the pool
select public.move_candidate(tests.candidate_id(3), null, null);
select is(tests.lane(), array[3], '#3 back in the pool');

-- undo check-in
select public.undo_check_in(tests.candidate_id(1));
select is(tests.status(1), 'registered', 'undo check-in returns to registered');
select ok((select checked_in_at is null from public.candidates where number = 1), 'check-in time cleared');
select is(tests.lane('Panel 1'), array[2], 'the lane closes the gap after undo');
select ok(tests.lanes_are_contiguous(), 'positions still contiguous');

-- errors
select throws_ok($$ select public.undo_check_in(tests.candidate_id(4)) $$, 'P0001', 'Candidate #4 is not waiting', 'cannot undo a check-in that never happened');
select throws_ok($$ select public.move_candidate(tests.candidate_id(4), null, 1) $$, 'P0001', 'Candidate is no longer waiting', 'cannot move someone who is not waiting');
select throws_ok($$ select public.skip_candidate(tests.candidate_id(4)) $$, 'P0001', 'Candidate is no longer waiting', 'cannot skip someone who is not waiting');
select throws_ok($$ select public.move_candidate(tests.candidate_id(3), gen_random_uuid(), 1) $$, 'P0001', 'Panel not found', 'unknown panel');
select throws_ok($$ select public.check_in(gen_random_uuid()) $$, 'P0001', 'Candidate not found', 'unknown candidate');

-- Review focus 1: a disabled account with a tab still open is refused immediately
select tests.as_postgres();
update public.profiles set is_active = false where username = 'qm_one';
select tests.login_as('qm_one');
select throws_ok($$ select public.check_in(tests.candidate_id(4)) $$, '42501', 'Not allowed', 'disabled queue manager is refused');

select * from finish();
rollback;
