-- ---------------------------------------------------------------------------
-- Profile details: a photo, contact details, links out, and one switch that
-- decides how much of it the rest of the household sees.
--
-- Until now a profile was a name, a timezone and a locale. That is enough to
-- address someone and nothing else: the family directory could not show a face,
-- a phone number, or where a person actually is, and the Career module talks
-- about a professional re-entry with no place to keep the LinkedIn or Xing
-- profile the re-entry runs through.
--
-- Two decisions are worth recording.
--
-- 1. Everything here is validated at the database, not just in the form.
--    `profiles` is written straight from the browser with the anon key, so the
--    form is not a boundary — a bounded column and a shape check are.
--
-- 2. Name, photo, pronouns and headline are always visible to the household;
--    phone, location, birthday, links and the emergency contact hang off
--    `share_contact_with_household`. You cannot meaningfully be anonymous in
--    your own family's directory, but you can decline to publish a phone
--    number to a Viewer who was invited for one shared calendar.
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- avatars/<household_id>/<uuid>.<ext>, the shape the storage policies parse.
  add column avatar_path text
    check (avatar_path is null or avatar_path ~
      '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'),
  -- Kept as free text on purpose: this household spans German, Bangladeshi and
  -- international numbers, and a format check would reject more real numbers
  -- than it would catch typos.
  add column phone text check (phone is null or length(phone) <= 32),
  add column pronouns text check (pronouns is null or length(pronouns) <= 32),
  add column headline text check (headline is null or length(headline) <= 80),
  add column location text check (location is null or length(location) <= 80),
  add column bio text check (bio is null or length(bio) <= 280),
  -- A plain range, not "not in the future": CHECK expressions must be
  -- immutable, and current_date is not. The form rejects future dates.
  add column birthday date
    check (birthday is null or birthday between '1900-01-01' and '2100-01-01'),
  add column accent_color text not null default 'green'
    check (accent_color in ('green', 'terracotta', 'amber', 'slate')),
  add column emergency_contact_name text
    check (emergency_contact_name is null or length(emergency_contact_name) <= 80),
  add column emergency_contact_phone text
    check (emergency_contact_phone is null or length(emergency_contact_phone) <= 32),
  add column emergency_contact_relation text
    check (emergency_contact_relation is null or length(emergency_contact_relation) <= 40),
  add column share_contact_with_household boolean not null default true;

-- ---------------------------------------------------------------------------
-- Links out
--
-- A check constraint cannot contain a subquery, so the shape test goes through
-- an immutable helper. Ten links, each an object with a platform slug and an
-- http(s) URL, is the boundary; the platform vocabulary itself stays in the
-- application (lib/profile-links.ts) so adding a network is not a migration.
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_profile_links(value jsonb)
returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'array'
     and jsonb_array_length(value) <= 10
     and coalesce(
       (
         select bool_and(
           jsonb_typeof(item) = 'object'
           and jsonb_typeof(item -> 'platform') = 'string'
           and jsonb_typeof(item -> 'url') = 'string'
           and length(item ->> 'platform') between 1 and 20
           and length(item ->> 'url') between 8 and 300
           and (item ->> 'url' like 'https://%' or item ->> 'url' like 'http://%')
           and length(coalesce(item ->> 'label', '')) <= 40
         )
         from jsonb_array_elements(value) as item
       ),
       true -- an empty array has nothing to disagree with
     )
$$;

alter table public.profiles
  add column links jsonb not null default '[]'::jsonb
    check (public.is_valid_profile_links(links));

-- ---------------------------------------------------------------------------
-- The directory the rest of the household reads
--
-- `profiles` is readable only by its owner ("own profile"), so this security
-- definer function stays the single read path for everyone else — which is
-- also what makes the sharing switch enforceable rather than cosmetic.
--
-- The return type changes, and PostgreSQL will not replace a function's return
-- type in place, so it is dropped and recreated with its grants.
-- ---------------------------------------------------------------------------

drop function if exists public.list_household_users();

create function public.list_household_users()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role public.household_role,
  avatar_path text,
  pronouns text,
  headline text,
  accent_color text,
  location text,
  phone text,
  birthday date,
  bio text,
  links jsonb,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  shares_contact boolean
)
language sql stable security definer set search_path = '' as $$
  select u.id,
         coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
         u.email,
         hm.role,
         p.avatar_path,
         p.pronouns,
         p.headline,
         p.accent_color,
         -- Everything below is withheld unless the member publishes it, except
         -- from the member themselves: your own row always reads back whole,
         -- so the directory can show you what the others would see.
         case when shared.visible then p.location end,
         case when shared.visible then p.phone end,
         case when shared.visible then p.birthday end,
         case when shared.visible then p.bio end,
         case when shared.visible then p.links else '[]'::jsonb end,
         case when shared.visible then p.emergency_contact_name end,
         case when shared.visible then p.emergency_contact_phone end,
         case when shared.visible then p.emergency_contact_relation end,
         p.share_contact_with_household
  from public.household_members hm
  join auth.users u on u.id = hm.user_id and u.email_confirmed_at is not null
  join public.profiles p on p.id = u.id
  cross join lateral (
    select p.share_contact_with_household or p.id = auth.uid() as visible
  ) shared
  where hm.household_id = public.current_household()
    and public.is_household_member(hm.household_id)
  order by lower(coalesce(nullif(p.display_name, ''), u.email))
$$;

revoke execute on function public.list_household_users() from public, anon;
grant execute on function public.list_household_users() to authenticated;
