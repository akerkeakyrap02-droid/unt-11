-- =====================================================================
-- English Test Prep  |  Seed data  (run AFTER schema.sql)
-- Demo logins created below:
--   teacher@example.com / Teacher123!      (role: teacher)
--   student@example.com / Student123!      (role: student, Group A)
-- Change or delete these accounts before real students use the site.
-- =====================================================================

insert into public.groups (name) values ('Group A'), ('Group B')
on conflict (name) do nothing;

-- 36 topic cards, empty. Targets only where the teacher gave them.
insert into public.topics (title, sort_order, target_question_count)
select v.title, v.ord, v.target
  from (values
    (1,  'Synonyms / Polysemy', 40),
    (2,  'Confusing words', 45),
    (3,  'Prepositions', 50),
    (4,  'Verbal idioms', 40),
    (5,  'Articles / Quantifiers', null),
    (6,  'Tenses', null),
    (7,  'Pronouns', null),
    (8,  'Gerunds / Infinitives', null),
    (9,  'Prefixes', null),
    (10, 'Suffixes', null),
    (11, 'Subject-verb agreement', null),
    (12, 'Need', null),
    (13, 'Questions', null),
    (14, 'Commands', null),
    (15, 'Modals 1', null),
    (16, 'Modals 2', null),
    (17, 'Conditionals', null),
    (18, 'Wish', null),
    (19, 'Would / Used to', null),
    (20, 'Linking verbs', null),
    (21, 'Adjectives and adverbs', null),
    (22, 'Comparisons 1', null),
    (23, 'Comparisons 2', null),
    (24, 'Nouns as adjectives; Enough', null),
    (25, 'Cause connectors (because, so that, so/such)', null),
    (26, 'Passive voice', null),
    (27, 'Causative verbs (have, get, make, let, help)', null),
    (28, 'Relative clauses 1', null),
    (29, 'Relative clauses 2', null),
    (30, 'That: other uses; Subjunctive', null),
    (31, 'Inclusives; Know / know how; Concession', null),
    (32, 'Problem verbs: rise/raise, lie/lay, sit/set', null),
    (33, 'Sequence of tenses; Say/tell; Pronoun antecedents; One/you', null),
    (34, 'Dangling participles; Participles as adjectives', null),
    (35, 'Redundancy; Parallel structure; Indirect objects; Adverbials at the start of a sentence', null),
    (36, 'Reported speech', null)
  ) as v(ord, title, target)
 where not exists (select 1 from public.topics);

-- One published sample test with 5 questions under "Prepositions".
do $$
declare
  tp uuid; tt uuid; qid uuid; r record;
begin
  select id into tp from public.topics where title = 'Prepositions' limit 1;
  if tp is null or exists (select 1 from public.tests where topic_id = tp) then return; end if;

  insert into public.tests (topic_id, title, status)
  values (tp, 'Prepositions - Test 1', 'published') returning id into tt;

  for r in
    select * from jsonb_to_recordset($q$[
      {"n":1,"type":"single","text":"She is interested ___ music.","options":["in","on","at","for"],"key":"A","expl":"interested in + noun"},
      {"n":2,"type":"single","text":"We arrived ___ the airport at six o'clock.","options":["in","at","to","on"],"key":"B","expl":"arrive at + a specific place (airport, station); arrive in + a city or country"},
      {"n":3,"type":"single","text":"He has lived here ___ 2019.","options":["for","since","from","in"],"key":"B","expl":"since + a point in time; for + a period of time"},
      {"n":4,"type":"single","text":"I'm afraid ___ spiders.","options":["of","from","with","at"],"key":"A","expl":"afraid of + noun"},
      {"n":5,"type":"fill_blank","text":"She is very good ___ playing chess.","options":null,"key":["at"],"expl":"good at + -ing"}
    ]$q$::jsonb) as x(n int, type public.question_type, text text, options jsonb, key jsonb, expl text)
  loop
    insert into public.questions (test_id, sort_order, type, text, options)
    values (tt, r.n, r.type, r.text, r.options) returning id into qid;
    insert into public.question_keys (question_id, correct_answer, explanation)
    values (qid, r.key, r.expl);
  end loop;
end $$;

-- Demo accounts. If this block errors on your Supabase version, skip it:
-- sign up normally in the app, then run the two UPDATE lines at the bottom.
do $$
declare
  t_id uuid := gen_random_uuid();
  s_id uuid := gen_random_uuid();
  gid  uuid;
begin
  select id into gid from public.groups where name = 'Group A';

  if not exists (select 1 from auth.users where email = 'teacher@example.com') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', t_id, 'authenticated', 'authenticated',
            'teacher@example.com', crypt('Teacher123!', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}',
            '{"name":"Demo Teacher","username":"teacher"}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), t_id, t_id::text,
            jsonb_build_object('sub', t_id::text, 'email', 'teacher@example.com'), 'email', now(), now(), now());
    update public.profiles set role = 'teacher' where id = t_id;
  end if;

  if not exists (select 1 from auth.users where email = 'student@example.com') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', s_id, 'authenticated', 'authenticated',
            'student@example.com', crypt('Student123!', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('name', 'Demo Student', 'username', 'student', 'group_id', gid::text),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), s_id, s_id::text,
            jsonb_build_object('sub', s_id::text, 'email', 'student@example.com'), 'email', now(), now(), now());
  end if;
end $$;

-- FALLBACK / making yourself the teacher:
--   update public.profiles set role = 'teacher' where email = 'your-email@example.com';
