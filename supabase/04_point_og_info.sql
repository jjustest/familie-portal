-- =====================================================================
-- Familie-Portal: roller, pokaler/point, bonusser og Info
-- Kør HELE filen i Supabase: SQL Editor → ny query → indsæt → Run.
-- Kan køres flere gange uden problemer.
-- =====================================================================

-- ---------- Roller ----------
-- parent = forælder (kan give point, oprette bonus og se forældre-info)
-- child  = barn (deltager i pokal-konkurrencen)
-- shared = fælles konto (infoskærmen)

alter table public.members
  add column if not exists role text not null default 'child';

do $$ begin
  alter table public.members add constraint members_role_chk check (role in ('parent', 'child', 'shared'));
exception when duplicate_object then null; end $$;

update public.members set role = 'shared' where is_shared and role <> 'shared';
-- Ret navnene her, hvis forældrene hedder noget andet i appen:
update public.members set role = 'parent' where name in ('Far', 'Mor') and role <> 'parent';

create or replace function public.is_parent()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.members
                 where user_id = (select auth.uid()) and role = 'parent');
$$;
revoke all on function public.is_parent() from public, anon;
grant execute on function public.is_parent() to authenticated;

-- ---------- Opgaver (skabeloner med point) ----------
create table if not exists public.chores (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(title) between 1 and 60),
  points     int  not null check (points between 1 and 1000),
  icon       text not null default '⭐',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Point (log: + for opgaver, − når en bonus indløses) ----------
create table if not exists public.points (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.members (user_id) on delete cascade,
  amount     int  not null check (amount between -100000 and 100000 and amount <> 0),
  reason     text not null check (length(reason) between 1 and 120),
  chore_id   uuid references public.chores (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists points_child_idx on public.points (child_id, created_at desc);

-- ---------- Bonusser ----------
create table if not exists public.rewards (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.members (user_id) on delete cascade,
  title       text not null check (length(title) between 1 and 80),
  cost        int  not null check (cost between 1 and 100000),
  redeemed_at timestamptz,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists rewards_child_idx on public.rewards (child_id);

-- ---------- Info-kort ----------
create table if not exists public.infos (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(title) between 1 and 80),
  icon       text not null default 'ℹ️',
  category   text not null default 'Andet',
  body       text,
  url        text,
  username   text,
  secret     text,
  phone      text,
  audience   text not null default 'alle' check (audience in ('alle', 'forældre')),
  sort       int  not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists infos_touch on public.infos;
create trigger infos_touch before update on public.infos
  for each row execute function public.touch_updated_at();

-- ---------- Rettigheder ----------
revoke all on public.chores, public.points, public.rewards, public.infos from anon;
grant select, insert, update, delete on public.chores, public.points, public.rewards, public.infos to authenticated;

alter table public.chores  enable row level security;
alter table public.points  enable row level security;
alter table public.rewards enable row level security;
alter table public.infos   enable row level security;

-- Alle i familien kan SE opgaver, point og bonusser; kun forældre kan ÆNDRE dem
do $$
declare t text;
begin
  foreach t in array array['chores', 'points', 'rewards'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using ((select public.is_member()))', t);
    execute format('drop policy if exists %1$s_write on public.%1$I', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated using ((select public.is_parent())) with check ((select public.is_parent()))', t);
  end loop;
end $$;

-- Info: "alle" ses af hele familien, "forældre" kun af forældre; kun forældre kan ændre
drop policy if exists infos_select on public.infos;
create policy infos_select on public.infos
  for select to authenticated
  using ((select public.is_member()) and (audience = 'alle' or (select public.is_parent())));

drop policy if exists infos_write on public.infos;
create policy infos_write on public.infos
  for all to authenticated
  using ((select public.is_parent()))
  with check ((select public.is_parent()));

-- ---------- Realtid ----------
do $$
declare t text;
begin
  foreach t in array array['chores', 'points', 'rewards', 'infos'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Startopgaver ----------
insert into public.chores (title, points, icon, sort)
select * from (values
  ('Støvsugning',              20, '🧹', 1),
  ('Opvask',                   15, '🍽️', 2),
  ('Tømme opvaskemaskine',     10, '🫧', 3),
  ('Gå tur med en hund',       10, '🐕', 4),
  ('Rydde op i stuen',         15, '🛋️', 5),
  ('Tage skraldet ud',         10, '🗑️', 6),
  ('Hænge vasketøj op',        15, '👕', 7)
) v(title, points, icon, sort)
where not exists (select 1 from public.chores);

-- Kontrol: roller
select name, role from public.members order by sort;
