-- The Sheema Edit Community
-- Supabase Free compatible schema. Run once in a fresh Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.community_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member' check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_spaces (
  id text primary key,
  name text not null,
  description text not null default '',
  emoji text not null default '♡',
  sort_order integer not null default 0
);

insert into public.community_spaces (id,name,description,emoji,sort_order) values
('mind','Mental Wellness & Unmasking','Identity, boundaries, burnout, masking, healing, overthinking, and learning yourself in public.','🦋',1),
('motherhood','Motherhood & Family','Parenting, family dynamics, relationships, overstimulation, and the parts nobody puts in the baby book.','🧸',2),
('chronic','Chronic Illness & Real Life','Energy, mobility, invisible symptoms, adapting, grief, wins, and being a whole person beyond a diagnosis.','🌙',3),
('lifestyle','Lifestyle & Beauty','Beauty, routines, style, little joys, soft resets, and doing things because they make life feel more like yours.','💄',4),
('chaos','Relatable Chaos','Funny stories, random thoughts, internet nonsense, and the group chat version of real life.','😭',5)
on conflict (id) do update set
  name=excluded.name,
  description=excluded.description,
  emoji=excluded.emoji,
  sort_order=excluded.sort_order;

create table if not exists public.community_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_profiles(id) on delete cascade,
  space_id text not null references public.community_spaces(id),
  body text not null check (char_length(body) between 1 and 3000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.community_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  reaction text not null default 'heart' check (reaction in ('heart')),
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_url text,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 600),
  url text not null,
  section text not null default 'Library' check (char_length(section) <= 60),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  check ((post_id is not null) <> (comment_id is not null))
);

create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_posts_space_idx on public.community_posts(space_id,created_at desc);
create index if not exists community_comments_post_idx on public.community_comments(post_id,created_at);
create index if not exists community_reactions_post_idx on public.community_reactions(post_id);

create or replace function public.community_is_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.community_admins where user_id=auth.uid());
$$;

create or replace function public.community_not_banned()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select auth.uid() is not null
    and not exists(select 1 from public.community_bans where user_id=auth.uid());
$$;

grant execute on function public.community_is_admin() to authenticated;
grant execute on function public.community_not_banned() to authenticated;

create or replace function public.community_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists community_profiles_touch on public.community_profiles;
create trigger community_profiles_touch before update on public.community_profiles
for each row execute function public.community_touch_updated_at();

drop trigger if exists community_posts_touch on public.community_posts;
create trigger community_posts_touch before update on public.community_posts
for each row execute function public.community_touch_updated_at();

drop trigger if exists community_comments_touch on public.community_comments;
create trigger community_comments_touch before update on public.community_comments
for each row execute function public.community_touch_updated_at();

create or replace function public.community_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.community_profiles(id,display_name)
  values(
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(coalesce(new.email,''),'@',1),''),'Member'),40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_for_community on auth.users;
create trigger on_auth_user_created_for_community
after insert on auth.users
for each row execute function public.community_handle_new_user();

insert into public.community_profiles(id,display_name)
select
  id,
  left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),nullif(split_part(coalesce(email,''),'@',1),''),'Member'),40)
from auth.users
on conflict (id) do nothing;

alter table public.community_profiles enable row level security;
alter table public.community_spaces enable row level security;
alter table public.community_admins enable row level security;
alter table public.community_bans enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_events enable row level security;
alter table public.community_resources enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists "members read profiles" on public.community_profiles;
create policy "members read profiles" on public.community_profiles for select to authenticated using (true);
drop policy if exists "members update own profile" on public.community_profiles;
create policy "members update own profile" on public.community_profiles for update to authenticated
using (id=auth.uid() and public.community_not_banned())
with check (id=auth.uid() and public.community_not_banned());

drop policy if exists "everyone reads spaces" on public.community_spaces;
create policy "everyone reads spaces" on public.community_spaces for select to anon, authenticated using (true);

drop policy if exists "admins read admin list" on public.community_admins;
create policy "admins read admin list" on public.community_admins for select to authenticated
using (user_id=auth.uid() or public.community_is_admin());

drop policy if exists "admins read bans" on public.community_bans;
create policy "admins read bans" on public.community_bans for select to authenticated
using (public.community_is_admin());
drop policy if exists "admins add bans" on public.community_bans;
create policy "admins add bans" on public.community_bans for insert to authenticated
with check (public.community_is_admin());
drop policy if exists "admins remove bans" on public.community_bans;
create policy "admins remove bans" on public.community_bans for delete to authenticated
using (public.community_is_admin());

drop policy if exists "members read posts" on public.community_posts;
create policy "members read posts" on public.community_posts for select to authenticated using (true);
drop policy if exists "members create posts" on public.community_posts;
create policy "members create posts" on public.community_posts for insert to authenticated
with check (
  author_id=auth.uid()
  and public.community_not_banned()
  and (is_pinned=false or public.community_is_admin())
);
drop policy if exists "members edit own posts" on public.community_posts;
create policy "members edit own posts" on public.community_posts for update to authenticated
using ((author_id=auth.uid() and public.community_not_banned()) or public.community_is_admin())
with check (
  ((author_id=auth.uid() and public.community_not_banned()) or public.community_is_admin())
  and (is_pinned=false or public.community_is_admin())
);
drop policy if exists "members delete own posts" on public.community_posts;
create policy "members delete own posts" on public.community_posts for delete to authenticated
using ((author_id=auth.uid() and public.community_not_banned()) or public.community_is_admin());

drop policy if exists "members read comments" on public.community_comments;
create policy "members read comments" on public.community_comments for select to authenticated using (true);
drop policy if exists "members create comments" on public.community_comments;
create policy "members create comments" on public.community_comments for insert to authenticated
with check (author_id=auth.uid() and public.community_not_banned());
drop policy if exists "members edit own comments" on public.community_comments;
create policy "members edit own comments" on public.community_comments for update to authenticated
using ((author_id=auth.uid() and public.community_not_banned()) or public.community_is_admin())
with check ((author_id=auth.uid() and public.community_not_banned()) or public.community_is_admin());
drop policy if exists "members delete own comments" on public.community_comments;
create policy "members delete own comments" on public.community_comments for delete to authenticated
using ((author_id=auth.uid() and public.community_not_banned()) or public.community_is_admin());

drop policy if exists "members read reactions" on public.community_reactions;
create policy "members read reactions" on public.community_reactions for select to authenticated using (true);
drop policy if exists "members react" on public.community_reactions;
create policy "members react" on public.community_reactions for insert to authenticated
with check (user_id=auth.uid() and public.community_not_banned());
drop policy if exists "members remove own reaction" on public.community_reactions;
create policy "members remove own reaction" on public.community_reactions for delete to authenticated
using (user_id=auth.uid() and public.community_not_banned());

drop policy if exists "members read published events" on public.community_events;
create policy "members read published events" on public.community_events for select to authenticated
using (is_published=true or public.community_is_admin());
drop policy if exists "admins manage events" on public.community_events;
create policy "admins manage events" on public.community_events for all to authenticated
using (public.community_is_admin())
with check (public.community_is_admin());

drop policy if exists "members read published resources" on public.community_resources;
create policy "members read published resources" on public.community_resources for select to authenticated
using (is_published=true or public.community_is_admin());
drop policy if exists "admins manage resources" on public.community_resources;
create policy "admins manage resources" on public.community_resources for all to authenticated
using (public.community_is_admin())
with check (public.community_is_admin());

drop policy if exists "members create reports" on public.community_reports;
create policy "members create reports" on public.community_reports for insert to authenticated
with check (reporter_id=auth.uid() and public.community_not_banned());
drop policy if exists "admins read reports" on public.community_reports;
create policy "admins read reports" on public.community_reports for select to authenticated
using (public.community_is_admin());
drop policy if exists "admins delete reports" on public.community_reports;
create policy "admins delete reports" on public.community_reports for delete to authenticated
using (public.community_is_admin());

create or replace view public.community_leaderboard
with (security_invoker=true)
as
with stats as (
  select
    p.id,
    p.display_name,
    p.avatar_url,
    (select count(*) from public.community_posts x where x.author_id=p.id) as post_count,
    (select count(*) from public.community_comments x where x.author_id=p.id) as comment_count,
    (select count(*) from public.community_reactions r join public.community_posts x on x.id=r.post_id where x.author_id=p.id) as reactions_received
  from public.community_profiles p
)
select
  *,
  (post_count*5 + comment_count*2 + reactions_received)::integer as points,
  case
    when (post_count*5 + comment_count*2 + reactions_received) >= 100 then 5
    when (post_count*5 + comment_count*2 + reactions_received) >= 50 then 4
    when (post_count*5 + comment_count*2 + reactions_received) >= 25 then 3
    when (post_count*5 + comment_count*2 + reactions_received) >= 10 then 2
    else 1
  end as level,
  case
    when (post_count*5 + comment_count*2 + reactions_received) >= 100 then 'Day One Energy'
    when (post_count*5 + comment_count*2 + reactions_received) >= 50 then 'Village Builder'
    when (post_count*5 + comment_count*2 + reactions_received) >= 25 then 'Community Friend'
    when (post_count*5 + comment_count*2 + reactions_received) >= 10 then 'Regular'
    else 'New Here'
  end as level_name
from stats;

grant select on public.community_leaderboard to authenticated;
grant select on public.community_spaces to anon, authenticated;
grant select, update on public.community_profiles to authenticated;
grant select, insert, update, delete on public.community_posts to authenticated;
grant select, insert, update, delete on public.community_comments to authenticated;
grant select, insert, delete on public.community_reactions to authenticated;
grant select, insert, update, delete on public.community_events to authenticated;
grant select, insert, update, delete on public.community_resources to authenticated;
grant select, insert, delete on public.community_reports to authenticated;


-- Enable live feed updates for posts, comments, and reactions.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_posts') then
    alter publication supabase_realtime add table public.community_posts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_comments') then
    alter publication supabase_realtime add table public.community_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_reactions') then
    alter publication supabase_realtime add table public.community_reactions;
  end if;
end $$;
