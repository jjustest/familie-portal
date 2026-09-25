-- =====================================================================
-- Familiemedlemmer
-- 1) Opret først brugerne i Supabase: Authentication → Users → Add user
--    → "Create new user" (e-mail + kodeord, sæt flueben i "Auto Confirm User").
-- 2) Ret e-mails, navne og farver herunder, og kør filen i SQL Editor.
--    Kan køres igen, fx hvis du ændrer et navn eller en farve.
-- =====================================================================

insert into public.members (user_id, name, color, is_shared, sort)
select u.id, m.name, m.color, m.is_shared, m.sort
from (values
  -- e-mail                         navn        farve      fælles-konto  rækkefølge
  ('familie@eksempel.dk',          'Familien', '#2f7de1', true,         0),
  ('far@eksempel.dk',              'Far',      '#0f9f8f', false,        1),
  ('mor@eksempel.dk',              'Mor',      '#d9468f', false,        2)
) as m(email, name, color, is_shared, sort)
join auth.users u on lower(u.email) = lower(m.email)
on conflict (user_id) do update
  set name = excluded.name, color = excluded.color,
      is_shared = excluded.is_shared, sort = excluded.sort;

-- Kontrol: hvem er med?
select m.name, u.email, m.color, m.is_shared
from public.members m join auth.users u on u.id = m.user_id
order by m.sort;
