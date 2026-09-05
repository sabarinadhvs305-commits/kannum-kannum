create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  best_score integer not null default 0,
  best_level integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  survival_seconds numeric(10,2) not null check (survival_seconds >= 0),
  level integer not null check (level >= 1),
  reason text not null,
  created_at timestamptz not null default now()
);

create or replace view public.leaderboard as
select p.username, max(r.survival_seconds) as best_score, max(r.level) as best_level
from public.profiles p
left join public.runs r on r.user_id = p.id
group by p.id, p.username
order by best_score desc nulls last;

-- A security-definer function can safely aggregate every player's runs without
-- granting players direct read access to other players' individual game data.
create or replace function public.get_leaderboard()
returns table (username text, best_score numeric, best_level integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.username,
    coalesce(max(r.survival_seconds), 0) as best_score,
    coalesce(max(r.level), 1) as best_level
  from public.profiles p
  left join public.runs r on r.user_id = p.id
  group by p.id, p.username
  order by max(r.survival_seconds) desc nulls last, p.username asc
  limit 25;
$$;

grant execute on function public.get_leaderboard() to authenticated;

alter table public.profiles enable row level security;
alter table public.runs enable row level security;

create policy "profiles are publicly readable" on public.profiles for select using (true);
create policy "users can create their profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users can update their profile" on public.profiles for update using (auth.uid() = id);
create policy "users can read their runs" on public.runs for select using (auth.uid() = user_id);
create policy "users can submit their runs" on public.runs for insert with check (auth.uid() = user_id);

-- If the original schema was already run, remove its display-name uniqueness.
alter table public.profiles drop constraint if exists profiles_username_key;
