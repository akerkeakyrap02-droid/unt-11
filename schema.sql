-- =====================================================================
-- English Test Prep  |  Step 1: database + auth
-- Run ONCE on a fresh Supabase project (SQL Editor -> New query -> Run).
-- =====================================================================

create extension if not exists pgcrypto;

create type public.user_role     as enum ('student', 'teacher');
create type public.test_status   as enum ('draft', 'published');
create type public.question_type as enum ('single', 'multiple', 'fill_blank', 'short_text', 'sentence_correction');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- "users" table from the spec. Named profiles because auth.users is Supabase's own.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  username   text unique,
  email      text,
  role       public.user_role not null default 'student',
  group_id   uuid references public.groups (id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.topics (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  sort_order            int  not null default 0,
  target_question_count int,
  study_content         text,
  hidden                boolean not null default false,
  created_at            timestamptz not null default now()
);

create table public.tests (
  id                 uuid primary key default gen_random_uuid(),
  topic_id           uuid not null references public.topics (id) on delete cascade,
  title              text not null,
  status             public.test_status not null default 'draft',
  publish_at         timestamptz,            -- optional scheduler: visible from this moment
  published_at       timestamptz,            -- set automatically; drives the 7-day "New" badge
  time_limit_minutes int,
  shuffle_questions  boolean not null default false,
  shuffle_options    boolean not null default false,
  created_at         timestamptz not null default now()
);

-- Options are a JSON array of strings; letters A, B, C... come from the index.
create table public.questions (
  id         uuid primary key default gen_random_uuid(),
  test_id    uuid not null references public.tests (id) on delete cascade,
  sort_order int  not null default 0,
  type       public.question_type not null default 'single',
  text       text not null,
  options    jsonb,
  points     numeric(5,2) not null default 1,
  created_at timestamptz not null default now()
);

-- Answer keys live in their own table so a student's browser can never read them.
-- single: "A"  |  multiple: ["A","C"]  |  fill_blank / short_text / sentence_correction: ["accepted 1","accepted 2"]
create table public.question_keys (
  question_id    uuid primary key references public.questions (id) on delete cascade,
  correct_answer jsonb not null,
  explanation    text
);

create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.tests (id) on delete cascade,
  group_id     uuid references public.groups (id) on delete cascade,   -- null = all students
  due_at       timestamptz,
  max_attempts int,
  created_at   timestamptz not null default now()
);

create table public.attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  test_id            uuid not null references public.tests (id) on delete cascade,
  assignment_id      uuid references public.assignments (id) on delete set null,
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  time_spent_seconds int,
  score              numeric(7,2),
  max_score          numeric(7,2)
);

create table public.attempt_answers (
  attempt_id      uuid not null references public.attempts (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete cascade,
  answer          jsonb,
  flagged         boolean not null default false,
  is_correct      boolean,
  points_awarded  numeric(5,2),
  teacher_comment text,
  updated_at      timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index on public.tests (topic_id);
create index on public.questions (test_id, sort_order);
create index on public.attempts (user_id, test_id);
create index on public.attempts (test_id);

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------

create function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'teacher' and active);
$$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- New sign-up -> profile row. Role is ALWAYS 'student'; it is never read from user input.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  begin
    g := nullif(new.raw_user_meta_data ->> 'group_id', '')::uuid;
  exception when others then
    g := null;
  end;
  if g is not null and not exists (select 1 from public.groups where id = g) then g := null; end if;

  insert into public.profiles (id, name, username, email, role, group_id)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(nullif(btrim(new.raw_user_meta_data ->> 'username'), '')),
    new.email,
    'student',
    g
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Students may edit their own name, nothing else on their profile.
create function public.protect_profile_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_teacher() then
    new.id       := old.id;
    new.role     := old.role;
    new.active   := old.active;
    new.group_id := old.group_id;
    new.username := old.username;
    new.email    := old.email;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Students may only write answer/flagged. Grading columns are server-only.
create function public.protect_answer_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_teacher() then
    if tg_op = 'INSERT' then
      new.is_correct := null; new.points_awarded := null; new.teacher_comment := null;
    else
      new.attempt_id := old.attempt_id; new.question_id := old.question_id;
      new.is_correct := old.is_correct; new.points_awarded := old.points_awarded;
      new.teacher_comment := old.teacher_comment;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger attempt_answers_protect before insert or update on public.attempt_answers
  for each row execute function public.protect_answer_columns();

create function public.set_published_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  else
    if new.status = 'published' and old.status <> 'published' then new.published_at := now(); end if;
    if new.status = 'draft' then new.published_at := null; end if;
  end if;
  return new;
end $$;

create trigger tests_published_at before insert or update on public.tests
  for each row execute function public.set_published_at();

-- ---------------------------------------------------------------------
-- Grading (runs on the server; the browser never sees answer keys)
-- ---------------------------------------------------------------------

create function public.norm_text(s text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(lower(btrim(coalesce(s, ''))), '\s+', ' ', 'g'), '[.!?]+$', '');
$$;

create function public.grade_answer(t public.question_type, key jsonb, ans jsonb) returns boolean
language plpgsql immutable as $$
declare a text[]; k text[];
begin
  if ans is null or jsonb_typeof(ans) = 'null' or key is null then return false; end if;

  if t = 'single' then
    return upper(btrim(ans #>> '{}')) = upper(btrim(key #>> '{}'));

  elsif t = 'multiple' then
    if jsonb_typeof(ans) <> 'array' or jsonb_typeof(key) <> 'array' then return false; end if;
    select coalesce(array_agg(upper(btrim(e.x)) order by upper(btrim(e.x))), '{}')
      into a from jsonb_array_elements_text(ans) as e(x);
    select coalesce(array_agg(upper(btrim(e.x)) order by upper(btrim(e.x))), '{}')
      into k from jsonb_array_elements_text(key) as e(x);
    return a = k;

  else  -- fill_blank, short_text, sentence_correction: match any accepted answer
    if jsonb_typeof(key) = 'array' then
      return exists (select 1 from jsonb_array_elements_text(key) as e(x)
                     where public.norm_text(e.x) = public.norm_text(ans #>> '{}'));
    end if;
    return public.norm_text(key #>> '{}') = public.norm_text(ans #>> '{}');
  end if;
end $$;

-- Submit an attempt. Safe to call twice (second call returns the saved result).
create function public.submit_attempt(p_attempt uuid) returns public.attempts
language plpgsql security definer set search_path = public as $$
declare
  att   public.attempts;
  q     record;
  ans   jsonb;
  ok    boolean;
  pts   numeric;
  total numeric := 0;
  maxs  numeric := 0;
begin
  if not public.is_active_user() then raise exception 'Account is not active'; end if;

  select * into att from public.attempts
   where id = p_attempt and user_id = auth.uid() for update;
  if not found then raise exception 'Attempt not found'; end if;
  if att.submitted_at is not null then return att; end if;

  for q in
    select qu.id, qu.type, qu.points, k.correct_answer
      from public.questions qu
      join public.question_keys k on k.question_id = qu.id
     where qu.test_id = att.test_id
  loop
    select aa.answer into ans from public.attempt_answers aa
     where aa.attempt_id = att.id and aa.question_id = q.id;

    ok  := public.grade_answer(q.type, q.correct_answer, ans);
    pts := case when ok then q.points else 0 end;

    insert into public.attempt_answers (attempt_id, question_id, answer, is_correct, points_awarded)
    values (att.id, q.id, ans, ok, pts)
    on conflict (attempt_id, question_id)
    do update set is_correct = excluded.is_correct, points_awarded = excluded.points_awarded;

    total := total + pts;
    maxs  := maxs + q.points;
  end loop;

  update public.attempts
     set submitted_at = now(),
         time_spent_seconds = extract(epoch from now() - started_at)::int,
         score = total,
         max_score = maxs
   where id = att.id
   returning * into att;

  return att;
end $$;

-- Answer sheet with correct answers. Only after submission, only for the owner or a teacher.
create function public.get_attempt_review(p_attempt uuid)
returns table (
  question_id uuid, sort_order int, type public.question_type, q_text text, options jsonb,
  points numeric, answer jsonb, is_correct boolean, points_awarded numeric,
  teacher_comment text, correct_answer jsonb, explanation text
)
language sql stable security definer set search_path = public as $$
  select q.id, q.sort_order, q.type, q.text, q.options,
         q.points, aa.answer, aa.is_correct, aa.points_awarded,
         aa.teacher_comment, k.correct_answer, k.explanation
    from public.attempts a
    join public.questions q on q.test_id = a.test_id
    join public.question_keys k on k.question_id = q.id
    left join public.attempt_answers aa on aa.attempt_id = a.id and aa.question_id = q.id
   where a.id = p_attempt
     and a.submitted_at is not null
     and (a.user_id = auth.uid() or public.is_teacher())
   order by q.sort_order, q.created_at;
$$;

revoke execute on function public.submit_attempt(uuid)       from public, anon;
revoke execute on function public.get_attempt_review(uuid)   from public, anon;
grant  execute on function public.submit_attempt(uuid)       to authenticated;
grant  execute on function public.get_attempt_review(uuid)   to authenticated;

-- ---------------------------------------------------------------------
-- Views (security_invoker = row-level security of the caller applies)
-- ---------------------------------------------------------------------

create view public.live_tests with (security_invoker = true) as
select t.*,
       coalesce(t.publish_at, t.published_at) as live_since,
       (select count(*) from public.questions q where q.test_id = t.id)::int as question_count
  from public.tests t
 where t.status = 'published'
   and (t.publish_at is null or t.publish_at <= now());

create view public.topic_cards with (security_invoker = true) as
select tp.id, tp.title, tp.sort_order, tp.hidden, tp.target_question_count,
       count(lt.id)::int                          as published_tests,
       coalesce(sum(lt.question_count), 0)::int   as published_questions,
       max(lt.live_since)                         as latest_live_at
  from public.topics tp
  left join public.live_tests lt on lt.topic_id = tp.id
 group by tp.id;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------

alter table public.groups          enable row level security;
alter table public.profiles        enable row level security;
alter table public.topics          enable row level security;
alter table public.tests           enable row level security;
alter table public.questions       enable row level security;
alter table public.question_keys   enable row level security;
alter table public.assignments     enable row level security;
alter table public.attempts        enable row level security;
alter table public.attempt_answers enable row level security;

-- groups: public read (the sign-up form needs the list), teacher write
create policy groups_read  on public.groups for select to anon, authenticated using (true);
create policy groups_write on public.groups for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- profiles
create policy profiles_read_own     on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_teacher());
create policy profiles_update_own   on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_teacher_all  on public.profiles for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- topics: students see non-hidden topics
create policy topics_read  on public.topics for select to authenticated
  using (public.is_teacher() or (not hidden and public.is_active_user()));
create policy topics_write on public.topics for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- tests: students see only live tests in visible topics
create policy tests_read on public.tests for select to authenticated
  using (
    public.is_teacher()
    or (status = 'published'
        and (publish_at is null or publish_at <= now())
        and public.is_active_user()
        and exists (select 1 from public.topics tp where tp.id = topic_id and not tp.hidden))
  );
create policy tests_write on public.tests for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- questions: visible whenever the parent test is visible (the subquery is filtered by tests RLS)
create policy questions_read on public.questions for select to authenticated
  using (public.is_teacher() or exists (select 1 from public.tests t where t.id = test_id));
create policy questions_write on public.questions for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- question_keys: teacher only. No student policy = no access.
create policy keys_teacher on public.question_keys for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- assignments
create policy assignments_read  on public.assignments for select to authenticated
  using (public.is_teacher() or public.is_active_user());
create policy assignments_write on public.assignments for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- attempts: students create and read their own; grading happens through submit_attempt()
create policy attempts_read on public.attempts for select to authenticated
  using (user_id = auth.uid() or public.is_teacher());
create policy attempts_insert on public.attempts for insert to authenticated
  with check (
    user_id = auth.uid()
    and submitted_at is null and score is null
    and public.is_active_user()
    and exists (select 1 from public.live_tests lt where lt.id = test_id)
  );
create policy attempts_teacher on public.attempts for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- attempt_answers: read own; write own only while the attempt is open
create policy answers_read on public.attempt_answers for select to authenticated
  using (public.is_teacher()
         or exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid()));
create policy answers_insert on public.attempt_answers for insert to authenticated
  with check (
    public.is_active_user()
    and exists (select 1 from public.attempts a
                 where a.id = attempt_id and a.user_id = auth.uid() and a.submitted_at is null)
    and exists (select 1 from public.questions q
                  join public.attempts a on a.test_id = q.test_id
                 where q.id = question_id and a.id = attempt_id)
  );
create policy answers_update on public.attempt_answers for update to authenticated
  using (exists (select 1 from public.attempts a
                  where a.id = attempt_id and a.user_id = auth.uid() and a.submitted_at is null))
  with check (exists (select 1 from public.attempts a
                       where a.id = attempt_id and a.user_id = auth.uid() and a.submitted_at is null));
create policy answers_teacher on public.attempt_answers for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- Anonymous visitors: only the group list (for sign-up).
revoke all on all tables in schema public from anon;
grant select on public.groups to anon;
