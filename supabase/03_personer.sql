-- =====================================================================
-- Familie-Portal: flere personer pr. aftale ("markér" personer)
-- Kør HELE filen i Supabase: SQL Editor → ny query → indsæt → Run.
-- Kan køres flere gange uden problemer.
-- =====================================================================

-- Ny kolonne: liste af markerede personer (tom = fælles)
alter table public.events
  add column if not exists person_ids uuid[] not null default '{}';

-- Flyt eksisterende "Hvem" over i den nye kolonne
update public.events
set person_ids = array[person_id]
where person_id is not null and cardinality(person_ids) = 0;

create index if not exists events_person_ids_idx on public.events using gin (person_ids);

-- Private aftaler kan ses/ændres af opretteren og alle markerede personer
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (
    (select public.is_member())
    and (not is_private
         or created_by = (select auth.uid())
         or person_id = (select auth.uid())
         or (select auth.uid()) = any (person_ids))
  );

drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (
    (select public.is_member())
    and (not is_private
         or created_by = (select auth.uid())
         or person_id = (select auth.uid())
         or (select auth.uid()) = any (person_ids))
  )
  with check ((select public.is_member()));

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using (
    (select public.is_member())
    and (not is_private
         or created_by = (select auth.uid())
         or person_id = (select auth.uid())
         or (select auth.uid()) = any (person_ids))
  );
