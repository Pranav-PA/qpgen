-- AI Question Paper Generator — initial schema.
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.

-- ============================================================ profiles
-- One row per auth user. NOT a parallel users table: keyed to auth.users.id
-- and created by trigger on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  is_disabled boolean not null default false,
  -- null = use the global default cap
  daily_generation_cap integer,
  generations_today integer not null default 0,
  last_generation_date date,
  institution_defaults jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check used by policies. SECURITY DEFINER avoids recursive RLS on profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_disabled
  );
$$;

-- ============================================================ papers
create table public.papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  exam_type text not null,
  subject text not null,
  chapters text[] not null,
  question_count integer not null,
  difficulty_settings jsonb not null,
  institution_details jsonb not null,
  questions jsonb not null default '[]'::jsonb,
  settings jsonb not null,
  reference_pdf_used boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index papers_user_created_idx on public.papers (user_id, created_at desc);

-- ============================================================ reported_questions
create table public.reported_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers (id) on delete cascade,
  question_index integer not null,
  -- Snapshot at report time, so the report survives later edits/deletes.
  question_snapshot jsonb,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index reported_questions_status_idx on public.reported_questions (status, created_at desc);

-- ============================================================ usage_logs
-- Written only by the server (service role). Powers admin stats and real cost tracking.
create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('generate_batch', 'regenerate_question', 'verify_batch', 'analyze_reference', 'export')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index usage_logs_created_idx on public.usage_logs (created_at desc);
create index usage_logs_user_idx on public.usage_logs (user_id, created_at desc);

-- ============================================================ app_config
-- Global settings the admin can change at runtime (kill switch, global cap).
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value) values
  ('limits', '{"global_daily_cap": 500, "default_user_daily_cap": 10, "generation_paused": false}');

-- ============================================================ rate limiting
-- Atomic check-and-increment. Returns:
--   'ok'            — allowed, counter incremented
--   'user_capped'   — user hit their daily cap
--   'global_capped' — site-wide daily budget exhausted
--   'paused'        — admin paused generation
--   'disabled'      — account disabled
create or replace function public.consume_generation(p_user_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  cfg jsonb;
  v_cap integer;
  v_profile public.profiles;
  v_global_today integer;
begin
  select value into cfg from public.app_config where key = 'limits';

  if coalesce((cfg ->> 'generation_paused')::boolean, false) then
    return 'paused';
  end if;

  -- Lock the profile row so concurrent invocations serialize.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile is null then return 'disabled'; end if;
  if v_profile.is_disabled then return 'disabled'; end if;

  -- Reset the daily counter on date rollover.
  if v_profile.last_generation_date is distinct from current_date then
    v_profile.generations_today := 0;
  end if;

  v_cap := coalesce(v_profile.daily_generation_cap, (cfg ->> 'default_user_daily_cap')::integer, 10);
  if v_profile.generations_today >= v_cap then
    return 'user_capped';
  end if;

  select count(*) into v_global_today
  from public.usage_logs
  where action = 'generate_batch' and created_at >= current_date;
  if v_global_today >= coalesce((cfg ->> 'global_daily_cap')::integer, 500) then
    return 'global_capped';
  end if;

  update public.profiles
  set generations_today = v_profile.generations_today + 1,
      last_generation_date = current_date
  where id = p_user_id;

  return 'ok';
end;
$$;

-- Only the service role may call this.
revoke execute on function public.consume_generation(uuid) from public, anon, authenticated;

-- ============================================================ RLS
alter table public.profiles enable row level security;
alter table public.papers enable row level security;
alter table public.reported_questions enable row level security;
alter table public.usage_logs enable row level security;
alter table public.app_config enable row level security;

-- profiles: read own (or any, if admin). Column-level grant restricts what a
-- user can update about themselves — role/caps/disabled stay server-controlled.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name, institution_defaults) on public.profiles to authenticated;

-- papers: owners have full CRUD; admins can read (for reviewing reports).
create policy "papers_select_own_or_admin" on public.papers
  for select using (user_id = auth.uid() or public.is_admin());
create policy "papers_insert_own" on public.papers
  for insert with check (user_id = auth.uid());
create policy "papers_update_own" on public.papers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "papers_delete_own" on public.papers
  for delete using (user_id = auth.uid());

-- reported_questions: teachers report their own papers' questions and see their
-- own reports; admins see and update everything.
create policy "reports_insert_own" on public.reported_questions
  for insert with check (
    reported_by = auth.uid()
    and exists (select 1 from public.papers p where p.id = paper_id and p.user_id = auth.uid())
  );
create policy "reports_select_own_or_admin" on public.reported_questions
  for select using (reported_by = auth.uid() or public.is_admin());
create policy "reports_update_admin" on public.reported_questions
  for update using (public.is_admin()) with check (public.is_admin());

-- usage_logs: users may read their own history; only the service role writes.
create policy "usage_select_own_or_admin" on public.usage_logs
  for select using (user_id = auth.uid() or public.is_admin());

-- app_config: no client policies — service role only (admin panel goes through the API).

-- ============================================================ storage: logos
insert into storage.buckets (id, name, public) values ('logos', 'logos', true);

create policy "logos_read_public" on storage.objects
  for select using (bucket_id = 'logos');
create policy "logos_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "logos_update_own_folder" on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "logos_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text
  );
