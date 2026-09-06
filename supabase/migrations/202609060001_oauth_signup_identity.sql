-- ---------------------------------------------------------------------------
-- Sign-up through an identity provider
--
-- handle_new_user() was written for one route in: the sign-up form, which puts
-- `display_name` and `household_name` into raw_user_meta_data itself. An OAuth
-- sign-up carries neither. Google and Microsoft send `full_name` and `name`,
-- GitHub sends `name` and `user_name`, Apple sends nothing at all after the
-- first authorization.
--
-- So every account created through a provider landed with display_name = '',
-- and household_directory() then fell back to the email local part — other
-- household members saw "faria" where the person's actual name was available
-- in the token all along.
--
-- Only the name resolution changes. The household still defaults to
-- 'My household': a provider tells us nothing about a family, and guessing one
-- from a person's name is worse than a name they can edit in Settings.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_household uuid;
  resolved_name text;
begin
  -- In preference order: what our own form sent, then what the provider sent,
  -- then the email local part with its separators turned back into spaces.
  -- Left empty when even that is unavailable, because '' is the column default
  -- and every read path already treats it as "no name yet".
  resolved_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(replace(replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' '), '_', ' '), ''),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, resolved_name)
  on conflict (id) do nothing;

  -- Every life_record hangs off a household, so a user without one cannot save
  -- anything. Create it in the same transaction as the account.
  insert into public.households (name, owner_user_id)
  values (
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'household_name'), ''), 'My household'),
    new.id
  )
  returning id into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household, new.id, 'owner');

  update public.profiles
  set active_household_id = new_household
  where id = new.id;

  return new;
end $$;
