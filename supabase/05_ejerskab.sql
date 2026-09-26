-- =====================================================================
-- Familie-Portal: man kan kun slette lister og aftaler, man selv har oprettet
-- Kør HELE filen i Supabase: SQL Editor → ny query → indsæt → Run.
-- Kan køres flere gange uden problemer.
-- =====================================================================

-- Lister får en "oprettet af" (gamle lister uden ejer kan slettes af forældre)
alter table public.lists
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

-- ---------- Lister ----------
drop policy if exists lists_all on public.lists;
drop policy if exists lists_select on public.lists;
drop policy if exists lists_insert on public.lists;
drop policy if exists lists_update on public.lists;
drop policy if exists lists_delete on public.lists;

create policy lists_select on public.lists
  for select to authenticated
  using ((select public.is_member()) and (owner_id is null or owner_id = (select auth.uid())));

create policy lists_insert on public.lists
  for insert to authenticated
  with check ((select public.is_member()) and (owner_id is null or owner_id = (select auth.uid())));

create policy lists_update on public.lists
  for update to authenticated
  using ((select public.is_member()) and (owner_id is null or owner_id = (select auth.uid())))
  with check ((select public.is_member()) and (owner_id is null or owner_id = (select auth.uid())));

create policy lists_delete on public.lists
  for delete to authenticated
  using (
    (select public.is_member())
    and (created_by = (select auth.uid())
         or (created_by is null and (select public.is_parent())))
  );

-- ---------- Aftaler: kun opretteren kan slette ----------
drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using ((select public.is_member()) and created_by = (select auth.uid()));
