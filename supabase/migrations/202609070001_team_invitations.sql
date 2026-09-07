-- ---------------------------------------------------------------------------
-- Invite somebody into a team, not just into the household
--
-- Teams could only be built from people who were already here. Bringing in a
-- new colleague meant inviting them to the household, waiting, and then
-- remembering to add them to the right team with the right role — three steps,
-- two of them easy to forget, and the access level decided long after the
-- decision was actually made.
--
-- An invitation now carries the team and the role it was issued for, and
-- accepting it does all of it at once. The household invitation is still the
-- thing being accepted: a team lives inside a household, and joining one
-- without the other would mean a member who can see the work and not the
-- people.
-- ---------------------------------------------------------------------------

alter table public.household_invitations
  add column team_id uuid references public.message_teams(id) on delete set null,
  add column team_role public.message_member_role not null default 'member';

-- The signature grows, so it is replaced rather than overloaded: two candidates
-- differing only by defaulted arguments make every existing call ambiguous.
drop function if exists public.create_household_invitation(text, public.household_role);

create function public.create_household_invitation(
  invitee_email text,
  invitee_role public.household_role default 'adult',
  invitee_team uuid default null,
  invitee_team_role public.message_member_role default 'member'
) returns table (
  invitation_id uuid,
  invitation_token text,
  email text,
  expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid := public.current_household();
  normalized_email text := lower(trim(invitee_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  created public.household_invitations%rowtype;
begin
  if auth.uid() is null or target_household is null
     or not public.is_household_owner(target_household) then
    raise exception 'Only a household owner can invite participants';
  end if;
  if invitee_role not in ('adult', 'viewer') then
    raise exception 'Invitations can only use adult or viewer access';
  end if;
  if length(normalized_email) not between 3 and 320
     or position('@' in normalized_email) < 2 then
    raise exception 'Enter a valid email address';
  end if;
  -- You can only invite into a team of this household, and only if you could
  -- have added them by hand.
  if invitee_team is not null then
    if not exists (
      select 1 from public.message_teams t
      where t.id = invitee_team and t.household_id = target_household
    ) then raise exception 'That team belongs to another household'; end if;
    if not public.can_manage_message_team(invitee_team) then
      raise exception 'Only a team owner can invite people into it';
    end if;
  end if;
  if exists (
    select 1 from public.household_members hm
    join auth.users u on u.id = hm.user_id
    where hm.household_id = target_household and lower(u.email) = normalized_email
  ) then raise exception 'That verified account already belongs to this household'; end if;

  update public.household_invitations i
  set revoked_at = now()
  where i.household_id = target_household
    and i.email = normalized_email
    and i.accepted_at is null
    and i.revoked_at is null;

  insert into public.household_invitations
    (household_id, invited_by, email, role, token_hash, team_id, team_role)
  values
    (target_household, auth.uid(), normalized_email, invitee_role,
     extensions.digest(raw_token, 'sha256'), invitee_team, invitee_team_role)
  returning * into created;

  return query select created.id, raw_token, created.email, created.expires_at;
end $$;

revoke execute on function public.create_household_invitation(
  text, public.household_role, uuid, public.message_member_role
) from public, anon;
grant execute on function public.create_household_invitation(
  text, public.household_role, uuid, public.message_member_role
) to authenticated;

-- Accepting places the person in the team the invitation named, with the role
-- it named. The team is joined in the same transaction as the household, so
-- there is no window where somebody is in the house but not in the room they
-- were invited to.
create or replace function public.accept_household_invitation(invitation_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  invitation public.household_invitations%rowtype;
  account_email text;
  confirmed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to accept this invitation'; end if;

  select lower(u.email), u.email_confirmed_at
  into account_email, confirmed_at
  from auth.users u where u.id = auth.uid();

  if confirmed_at is null then raise exception 'Verify your email before joining'; end if;

  select * into invitation
  from public.household_invitations i
  where length(invitation_token) = 64
    and i.token_hash = extensions.digest(invitation_token, 'sha256')
  for update;

  if invitation.id is null or invitation.accepted_at is not null
     or invitation.revoked_at is not null or invitation.expires_at <= now() then
    raise exception 'This invitation is invalid or no longer available';
  end if;
  if account_email is distinct from invitation.email then
    raise exception 'Sign in with the email address this invitation was sent to';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, auth.uid(), invitation.role)
  on conflict (household_id, user_id) where user_id is not null
  do nothing;

  if invitation.team_id is not null then
    insert into public.message_team_members (team_id, user_id, added_by, member_role)
    values (invitation.team_id, auth.uid(), invitation.invited_by, invitation.team_role)
    on conflict (team_id, user_id) do update set member_role = excluded.member_role;
  end if;

  update public.profiles
  set active_household_id = invitation.household_id
  where id = auth.uid();

  update public.household_invitations
  set accepted_by = auth.uid(), accepted_at = now()
  where id = invitation.id;

  return invitation.household_id;
end $$;

-- Inviting into a team means inviting into the household that contains it, and
-- that is a larger grant than team ownership carries: a household member can
-- read the Family and Home records everybody shares. So both checks apply —
-- team ownership decides which team, household ownership decides whether a new
-- person may be admitted at all.
--
-- Stated separately so the refusal says which one is missing. Deferring to the
-- inner function produced "Only a household owner can invite participants" for
-- somebody who was looking at a team they own, which reads as a bug.
create or replace function public.create_team_invitation(
  invitee_email text,
  target_team uuid,
  invitee_team_role public.message_member_role default 'member'
) returns table (
  invitation_id uuid,
  invitation_token text,
  email text,
  expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  target_household uuid;
begin
  if not public.can_manage_message_team(target_team) then
    raise exception 'Only a team owner can invite people into it';
  end if;
  select household_id into target_household
  from public.message_teams where id = target_team;
  if not public.is_household_owner(target_household) then
    raise exception 'Only the household owner can admit someone new. Ask them to invite this person, then add them to the team.';
  end if;
  return query select * from public.create_household_invitation(
    invitee_email, 'adult'::public.household_role, target_team, invitee_team_role
  );
end $$;

revoke execute on function public.create_team_invitation(
  text, uuid, public.message_member_role
) from public, anon;
grant execute on function public.create_team_invitation(
  text, uuid, public.message_member_role
) to authenticated;
