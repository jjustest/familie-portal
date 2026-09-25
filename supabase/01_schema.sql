-- =====================================================================
-- Familie-Portal: database, sikkerhed (RLS) og realtid
-- Kør HELE filen i Supabase: SQL Editor → New query → indsæt → Run.
-- Filen kan køres igen uden at ødelægge data.
-- =====================================================================

-- ---------- Tabeller ----------

-- Familiemedlemmer. Kun brugere, der står her, kan se og ændre data.
create table if not exists public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#2f7de1',
  is_shared  boolean not null default false,   -- true = fælles konto (infoskærmen)
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- Kalenderaftaler
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  all_day     boolean not null default false,
  person_id   uuid references public.members (user_id) on delete set null, -- null = fælles
  is_private  boolean not null default false,  -- kun synlig for personen/opretteren
  note        text,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists events_starts_at_idx on public.events (starts_at);

-- Lister (indkøb, huske osv.)
create table if not exists public.lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 60),
  icon       text not null default '📝',
  sort       int not null default 0,
  owner_id   uuid references auth.users (id) on delete cascade,   -- null = fælles liste
  created_at timestamptz not null default now()
);

create table if not exists public.list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  text       text not null check (length(text) between 1 and 200),
  done       boolean not null default false,
  done_at    timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists list_items_list_idx on public.list_items (list_id);

-- updated_at på aftaler
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------- Hjælpefunktion: er den indloggede bruger familiemedlem? ----------

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where user_id = (select auth.uid()));
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- ---------- Rettigheder: kun indloggede, aldrig anonyme ----------

revoke all on public.members, public.events, public.lists, public.list_items from anon;
grant select on public.members to authenticated;
grant select, insert, update, delete on public.events, public.lists, public.list_items to authenticated;

-- ---------- Row Level Security ----------

alter table public.members    enable row level security;
alter table public.events     enable row level security;
alter table public.lists      enable row level security;
alter table public.list_items enable row level security;

-- members: familien kan se hinanden (ændres kun via SQL af dig)
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using ((select public.is_member()));

-- events
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (
    (select public.is_member())
    and (not is_private or created_by = (select auth.uid()) or person_id = (select auth.uid()))
  );

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated
  with check (
    (select public.is_member())
    and created_by = (select auth.uid())
  );

drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (
    (select public.is_member())
    and (not is_private or created_by = (select auth.uid()) or person_id = (select auth.uid()))
  )
  with check ((select public.is_member()));

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using (
    (select public.is_member())
    and (not is_private or created_by = (select auth.uid()) or person_id = (select auth.uid()))
  );

-- lists: fælles (owner_id null) eller egne
drop policy if exists lists_all on public.lists;
create policy lists_all on public.lists
  for all to authenticated
  using ((select public.is_member()) and (owner_id is null or owner_id = (select auth.uid())))
  with check ((select public.is_member()) and (owner_id is null or owner_id = (select auth.uid())));

-- list_items: adgang hvis man har adgang til listen
drop policy if exists list_items_all on public.list_items;
create policy list_items_all on public.list_items
  for all to authenticated
  using (
    (select public.is_member())
    and exists (select 1 from public.lists l
                where l.id = list_id and (l.owner_id is null or l.owner_id = (select auth.uid())))
  )
  with check (
    (select public.is_member())
    and exists (select 1 from public.lists l
                where l.id = list_id and (l.owner_id is null or l.owner_id = (select auth.uid())))
  );

-- ---------- Realtid (ændringer vises straks på alle skærme) ----------

do $$
declare t text;
begin
  foreach t in array array['events', 'lists', 'list_items'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Startlister ----------

insert into public.lists (name, icon, sort)
select * from (values ('Indkøb', '🛒', 1), ('Huskeliste', '📌', 2)) v(name, icon, sort)
where not exists (select 1 from public.lists);
