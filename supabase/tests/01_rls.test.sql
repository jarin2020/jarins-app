
-- The 'authenticated' role is created by run.sh; it is cluster-wide and outlives
-- the throwaway test database. It is not the table owner, so RLS applies to it.
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;

-- Two unrelated accounts. The trigger gives each a profile, a household and an
-- owner membership.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'faria@example.test', now(), '{"display_name":"Faria"}'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@example.test', now(), '{}');

-- A third account joined to Faria's household, to test collaboration.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'partner@example.test', now(), '{}'),
  ('44444444-4444-4444-4444-444444444444', 'invitee@example.test', now(), '{"display_name":"Invitee"}'),
  ('55555555-5555-5555-5555-555555555555', 'unverified@example.test', null, '{}');
insert into public.household_members (household_id, user_id, role)
  select id, '33333333-3333-3333-3333-333333333333', 'adult'
  from public.households where owner_user_id = '11111111-1111-1111-1111-111111111111';

-- A global life area, the kind S3 let anyone delete.
insert into public.life_areas (household_id, slug, name, color_token, icon)
  values (null, 'family', 'Family', 'green', 'baby');

do $$
declare
  faria    uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner  uuid := '33333333-3333-3333-3333-333333333333';
  n int;
  record_id uuid;
  task_id uuid;
  faria_household uuid;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  -- ============ profile + household bootstrap (S8) ============
  select count(*) into n from public.profiles where id = faria;
  if n <> 1 then raise exception 'FAIL S8: no profile created for new user'; end if;
  select count(*) into n from public.households where owner_user_id = faria;
  if n <> 1 then raise exception 'FAIL S8: no household created for new user'; end if;
  raise notice 'PASS S8  profile and household bootstrap on signup';

  -- ============ life_records isolation ============
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.life_records (module, kind, title, detail, essential)
    values ('family', 'Routine', 'Prepare Kita bags', 'Water bottle and spare clothes', true)
    returning id into record_id;

  select count(*) into n from public.life_records;
  if n <> 1 then raise exception 'FAIL: owner cannot see own record (saw %)', n; end if;

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.life_records;
  if n <> 0 then raise exception 'FAIL: another household leaked % record(s)', n; end if;
  raise notice 'PASS     life_records are invisible across households';

  -- a stranger must not be able to update or delete either
  update public.life_records set title = 'hijacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger updated % row(s)', n; end if;
  delete from public.life_records;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger deleted % row(s)', n; end if;
  raise notice 'PASS     strangers cannot write to another household''s records';

  -- ============ S3: global life areas are read-only ============
  select count(*) into n from public.life_areas where household_id is null;
  if n <> 1 then raise exception 'FAIL S3: global life area not readable (saw %)', n; end if;

  delete from public.life_areas where household_id is null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL S3: stranger deleted % global life area(s)', n; end if;

  update public.life_areas set name = 'hijacked' where household_id is null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL S3: stranger updated % global life area(s)', n; end if;
  raise notice 'PASS S3  global life areas are readable but not writable';

  -- ============ S4: a partner can complete a shared task ============
  perform set_config('request.jwt.claim.sub', faria::text, true);
  insert into public.tasks (household_id, creator_user_id, title)
    values (faria_household, faria, 'Book the Kita appointment')
    returning id into task_id;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  update public.tasks set status = 'done' where id = task_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL S4: partner could not complete a shared task'; end if;
  raise notice 'PASS S4  household members can complete each other''s tasks';

  -- …but cannot rewrite authorship
  update public.tasks set creator_user_id = partner where id = task_id;
  select count(*) into n from public.tasks where id = task_id and creator_user_id = faria;
  if n <> 1 then raise exception 'FAIL S4: creator_user_id was reassignable'; end if;
  raise notice 'PASS S4  creator_user_id is frozen against reassignment';

  -- the same must hold for life_records authorship
  perform set_config('request.jwt.claim.sub', partner::text, true);
  update public.life_records set created_by = partner where id = record_id;
  select count(*) into n from public.life_records where id = record_id and created_by = faria;
  if n <> 1 then raise exception 'FAIL: life_records.created_by was reassignable'; end if;
  raise notice 'PASS     life_records authorship is frozen';

  reset role;
end $$;

-- ============ private connected email accounts ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  created_account_id uuid;
  blocked boolean := false;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.email_accounts
    (provider, address, label, status, provider_account_id)
  values ('gmail', 'faria@example.test', 'Personal', 'active', 'provider-faria')
  returning id into created_account_id;

  insert into public.email_credentials
    (account_id, user_id, ciphertext, iv)
  values (created_account_id, faria, repeat('c', 40), repeat('i', 16));

  perform public.claim_email_send_slot(created_account_id);
  select count(*) into n from public.email_send_events
  where account_id = created_account_id;
  if n <> 0 then
    raise exception 'FAIL: direct access exposed internal email rate-limit events';
  end if;

  insert into public.email_messages
    (account_id, user_id, provider_message_id, subject, sender_address,
     received_at, snippet)
  values
    (created_account_id, faria, 'provider-message-1', 'Private mail',
     'sender@example.test', now(), 'Only the mailbox owner can read this');

  select count(*) into n from public.email_messages where account_id = created_account_id;
  if n <> 1 then raise exception 'FAIL: mailbox owner cannot read cached email metadata'; end if;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.email_accounts where id = created_account_id;
  if n <> 0 then raise exception 'FAIL: household partner read a private email account'; end if;
  select count(*) into n from public.email_credentials where account_id = created_account_id;
  if n <> 0 then raise exception 'FAIL: household partner read encrypted email credentials'; end if;
  select count(*) into n from public.email_messages where account_id = created_account_id;
  if n <> 0 then raise exception 'FAIL: household partner read private email metadata'; end if;
  raise notice 'PASS     connected email accounts stay private to their owner';

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    perform public.claim_email_send_slot(created_account_id);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: another user claimed an email send slot'; end if;
  begin
    insert into public.email_messages
      (account_id, user_id, provider_message_id, received_at)
    values (created_account_id, faria, 'spoofed', now());
    raise exception 'FAIL: another user spoofed email metadata ownership';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     email writes cannot spoof another account owner';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.email_accounts
  set user_id = stranger, provider = 'outlook', address = 'changed@example.test'
  where id = created_account_id;
  select count(*) into n from public.email_accounts
  where id = created_account_id and user_id = faria and provider = 'gmail'
    and address = 'faria@example.test';
  if n <> 1 then raise exception 'FAIL: email account identity was mutable'; end if;
  raise notice 'PASS     email account ownership and provider identity are frozen';

  reset role;
end $$;

-- ============ connected calendar privacy + family sharing ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  faria_household uuid;
  created_calendar_account uuid;
  created_calendar_source uuid;
  created_calendar_event uuid;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.calendar_accounts
    (household_id, provider, address, label, status, share_with_household)
  values
    (faria_household, 'google', 'faria@example.test', 'Personal', 'active', true)
  returning id into created_calendar_account;
  insert into public.calendar_credentials
    (account_id, user_id, ciphertext, iv)
  values (created_calendar_account, faria, repeat('c', 40), repeat('i', 16));
  insert into public.calendar_sources
    (account_id, user_id, provider_calendar_id, name, is_primary)
  values (created_calendar_account, faria, 'primary', 'Personal', true)
  returning id into created_calendar_source;
  insert into public.calendar_events
    (source_id, account_id, owner_user_id, household_id, provider_event_id,
     source_name, owner_name, title, starts_at, ends_at)
  values
    (created_calendar_source, created_calendar_account, faria, faria_household, 'provider-event-1',
     'Personal', 'Faria', 'Shared appointment', now(), now() + interval '1 hour')
  returning id into created_calendar_event;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.calendar_events where id = created_calendar_event;
  if n <> 1 then raise exception 'FAIL: household partner could not read a shared calendar event'; end if;
  select count(*) into n from public.calendar_accounts where id = created_calendar_account;
  if n <> 0 then raise exception 'FAIL: household partner read a private calendar account'; end if;
  select count(*) into n from public.calendar_credentials where account_id = created_calendar_account;
  if n <> 0 then raise exception 'FAIL: household partner read calendar credentials'; end if;
  select count(*) into n from public.calendar_sources where id = created_calendar_source;
  if n <> 0 then raise exception 'FAIL: household partner read private calendar source metadata'; end if;
  update public.calendar_events set title = 'hijacked' where id = created_calendar_event;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: household partner edited an external event'; end if;
  raise notice 'PASS     shared calendar events are readable but not editable by household members';

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.calendar_events where id = created_calendar_event;
  if n <> 0 then raise exception 'FAIL: shared calendar event leaked outside its household'; end if;
  begin
    insert into public.calendar_events
      (source_id, account_id, owner_user_id, provider_event_id, source_name,
       owner_name, title, starts_at, ends_at)
    values
      (created_calendar_source, created_calendar_account, faria, 'spoofed', 'Personal', 'Faria', 'Spoofed',
       now(), now() + interval '1 hour');
    raise exception 'FAIL: stranger spoofed calendar event ownership';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     calendar events remain isolated from other households';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.calendar_accounts
  set user_id = stranger, provider = 'microsoft', address = 'changed@example.test'
  where id = created_calendar_account;
  select count(*) into n from public.calendar_accounts
  where id = created_calendar_account and user_id = faria and provider = 'google'
    and address = 'faria@example.test';
  if n <> 1 then raise exception 'FAIL: calendar account identity was mutable'; end if;
  raise notice 'PASS     calendar account ownership and provider identity are frozen';

  reset role;
end $$;

-- ============ private VAULT storage accounts + metadata ==========
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  created_storage_account uuid;
  created_storage_item uuid;
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);

  insert into public.storage_accounts
    (provider, address, label, status, access_mode, provider_account_id,
     root_provider_item_id)
  values
    ('google-drive', 'faria@example.test', 'Family Drive', 'active', 'manage',
     'provider-faria', 'root')
  returning id into created_storage_account;
  insert into public.storage_credentials
    (account_id, user_id, ciphertext, iv)
  values (created_storage_account, faria, repeat('c', 40), repeat('i', 16));
  insert into public.storage_items
    (account_id, user_id, provider_item_id, parent_provider_item_id, path,
     name, item_kind, mime_type, size_bytes, can_edit)
  values
    (created_storage_account, faria, 'provider-file-1', 'root',
     'Family/Passport scan.pdf', 'Passport scan.pdf', 'file',
     'application/pdf', 1024, true)
  returning id into created_storage_item;

  select count(*) into n from public.storage_items
  where search_vector @@ websearch_to_tsquery('simple', 'passport');
  if n <> 1 then raise exception 'FAIL: VAULT filename search did not match'; end if;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from public.storage_accounts where id = created_storage_account;
  if n <> 0 then raise exception 'FAIL: household partner read a private VAULT account'; end if;
  select count(*) into n from public.storage_credentials where account_id = created_storage_account;
  if n <> 0 then raise exception 'FAIL: household partner read encrypted VAULT credentials'; end if;
  select count(*) into n from public.storage_items where id = created_storage_item;
  if n <> 0 then raise exception 'FAIL: household partner read private VAULT filenames'; end if;
  raise notice 'PASS     VAULT accounts, credentials and filenames stay owner-private';

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  begin
    insert into public.storage_items
      (account_id, user_id, provider_item_id, path, name, item_kind)
    values
      (created_storage_account, faria, 'spoofed', 'Private.txt', 'Private.txt', 'file');
    raise exception 'FAIL: stranger spoofed VAULT metadata ownership';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     VAULT metadata ownership cannot be spoofed';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  update public.storage_accounts
  set user_id = stranger, provider = 'dropbox', address = 'changed@example.test',
      provider_account_id = 'changed-provider'
  where id = created_storage_account;
  select count(*) into n from public.storage_accounts
  where id = created_storage_account and user_id = faria
    and provider = 'google-drive' and address = 'faria@example.test'
    and provider_account_id = 'provider-faria';
  if n <> 1 then raise exception 'FAIL: VAULT account identity was mutable'; end if;
  raise notice 'PASS     VAULT account ownership and provider identity are frozen';

  reset role;
end $$;

-- ============ S5: storage paths agree with the row policies ============
do $$
declare
  faria    uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  partner  uuid := '33333333-3333-3333-3333-333333333333';
  faria_household uuid;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  insert into storage.objects (bucket_id, name) values
    ('documents-private', faria_household || '/normal/passport-scan.pdf'),
    ('documents-private', faria_household || '/high/tax-id.pdf');

  insert into public.documents
    (household_id, uploaded_by_user_id, title, category, storage_path, mime_type, size_bytes, sensitivity)
  values
    (faria_household, faria, 'Insurance policy', 'Insurance',
     faria_household || '/normal/passport-scan.pdf', 'application/pdf', 1024, 'normal'),
    (faria_household, faria, 'Tax identification', 'Identity',
     faria_household || '/high/tax-id.pdf', 'application/pdf', 2048, 'high');

  set local role authenticated;

  -- the partner shares the household: normal yes, high no
  perform set_config('request.jwt.claim.sub', partner::text, true);
  select count(*) into n from storage.objects where bucket_id = 'documents-private';
  if n <> 1 then raise exception 'FAIL S5: household member saw % objects, expected 1 (normal only)', n; end if;
  raise notice 'PASS S5  household members read normal documents but not high-sensitivity ones';

  -- the uploader sees both
  perform set_config('request.jwt.claim.sub', faria::text, true);
  select count(*) into n from storage.objects where bucket_id = 'documents-private';
  if n <> 2 then raise exception 'FAIL S5: uploader saw % objects, expected 2', n; end if;
  raise notice 'PASS S5  the uploader still reads their own high-sensitivity documents';

  -- a stranger sees nothing
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from storage.objects where bucket_id = 'documents-private';
  if n <> 0 then raise exception 'FAIL S5: stranger saw % document object(s)', n; end if;
  raise notice 'PASS S5  strangers read no documents at all';

  -- a malformed path must deny rather than raise
  reset role;
  insert into storage.objects (bucket_id, name) values ('documents-private', 'not-a-uuid/normal/x.pdf');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  select count(*) into n from storage.objects where name like 'not-a-uuid%';
  if n <> 0 then raise exception 'FAIL S5: malformed path was readable'; end if;
  raise notice 'PASS S5  a malformed storage path denies instead of erroring';

  reset role;
end $$;

-- ============ S9: the audit log now has a writer ============
do $$
declare n int;
begin
  select count(*) into n from public.audit_events where entity_type = 'documents';
  if n < 2 then raise exception 'FAIL S9: audit log recorded % document events, expected >= 2', n; end if;
  select count(*) into n from public.audit_events
    where metadata::text like '%passport%' or metadata::text like '%tax%';
  if n <> 0 then raise exception 'FAIL S9: audit metadata leaked document titles'; end if;
  raise notice 'PASS S9  audit events are written and carry no document metadata';
end $$;

-- ============ generated search vector ============
do $$
declare n int;
begin
  select count(*) into n from public.life_records
    where search @@ to_tsquery('simple', 'kita');
  if n <> 1 then raise exception 'FAIL: full-text search matched % rows, expected 1', n; end if;
  raise notice 'PASS     generated tsvector search works';
end $$;

-- ============ household invitations + messaging ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  invitee uuid := '44444444-4444-4444-4444-444444444444';
  unverified uuid := '55555555-5555-5555-5555-555555555555';
  faria_household uuid;
  invitation_token text;
  created_team_id uuid;
  created_thread_id uuid;
  family_thread_id uuid;
  first_message uuid;
  file_message uuid;
  unverified_token text;
  blocked boolean := false;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  select created.invitation_token into invitation_token
  from public.create_household_invitation('invitee@example.test', 'adult') created;
  if invitation_token is null or length(invitation_token) <> 64 then
    raise exception 'FAIL: invitation did not return a strong bearer token';
  end if;

  perform set_config('request.jwt.claim.sub', invitee::text, true);
  perform public.accept_household_invitation(invitation_token);
  if public.current_household() is distinct from faria_household then
    raise exception 'FAIL: accepting an invitation did not switch the active household';
  end if;
  raise notice 'PASS     verified invitation joins and activates the shared household';

  select id into family_thread_id
  from public.message_threads
  where household_id = faria_household and is_family_thread;
  select count(*) into n
  from public.message_thread_members
  where thread_id = family_thread_id;
  if family_thread_id is null or n <> 3 then
    raise exception 'FAIL: Family thread did not include all three household members (saw %)', n;
  end if;
  perform set_config('request.jwt.claim.sub', faria::text, true);
  blocked := false;
  begin
    delete from public.message_threads where id = family_thread_id;
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: fixed Family thread could be deleted'; end if;
  raise notice 'PASS     Family thread is fixed and automatically includes new members';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  select created.invitation_token into unverified_token
  from public.create_household_invitation('unverified@example.test', 'adult') created;
  perform set_config('request.jwt.claim.sub', unverified::text, true);
  blocked := false;
  begin
    perform public.accept_household_invitation(unverified_token);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: an unverified account accepted an invitation'; end if;
  raise notice 'PASS     unverified accounts cannot accept household invitations';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  created_team_id := public.create_message_team('Parents', array[invitee]);
  created_thread_id := public.create_message_thread(
    'Family plans', array[]::uuid[], array[created_team_id]
  );
  select count(*) into n from public.message_thread_members
  where thread_id = created_thread_id;
  if n <> 2 then raise exception 'FAIL: team did not expand to two thread members (saw %)', n; end if;

  insert into public.messages (household_id, thread_id, body)
  values (faria_household, created_thread_id, 'Dinner at six') returning id into first_message;

  perform set_config('request.jwt.claim.sub', invitee::text, true);
  select count(*) into n from public.messages where id = first_message;
  if n <> 1 then raise exception 'FAIL: invited participant did not receive the message'; end if;
  select count(*) into n from public.message_notifications
  where message_id = first_message and read_at is null;
  if n <> 1 then raise exception 'FAIL: recipient did not receive one unread notification'; end if;
  perform public.mark_message_thread_read(created_thread_id);
  select count(*) into n from public.message_notifications
  where message_id = first_message and read_at is null;
  if n <> 0 then raise exception 'FAIL: marking the thread read left an unread notification'; end if;
  raise notice 'PASS     delivery, notifications and read receipts are persisted';

  insert into public.messages (household_id, thread_id, body)
  values (faria_household, created_thread_id, 'The itinerary is attached')
  returning id into file_message;
  insert into storage.objects (bucket_id, name)
  values ('message-attachments-private',
          faria_household || '/' || created_thread_id || '/' || invitee || '/attachment-id');
  insert into public.message_attachments
    (household_id, message_id, uploader_user_id, storage_path, file_name, mime_type, size_bytes)
  values
    (faria_household, file_message, invitee,
     faria_household || '/' || created_thread_id || '/' || invitee || '/attachment-id',
     'itinerary.pdf', 'application/pdf', 1024);
  select count(*) into n from storage.objects
  where bucket_id = 'message-attachments-private';
  if n <> 1 then raise exception 'FAIL: thread member could not access attachment storage'; end if;

  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.messages where id = first_message;
  if n <> 0 then raise exception 'FAIL: a different household read a private message'; end if;
  select count(*) into n from storage.objects
  where bucket_id = 'message-attachments-private';
  if n <> 0 then raise exception 'FAIL: a different household read a private attachment'; end if;
  begin
    insert into public.messages (household_id, thread_id, body)
    values (faria_household, created_thread_id, 'intrusion');
    raise exception 'FAIL: a non-member inserted a message';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS     message and attachment policies isolate households';

  perform set_config('request.jwt.claim.sub', faria::text, true);
  blocked := false;
  begin
    insert into public.message_thread_members
      (thread_id, user_id, member_role, direct_member, added_by)
    values (created_thread_id, unverified, 'member', true, faria);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: direct membership bypassed account verification'; end if;
  raise notice 'PASS     thread membership rejects unverified accounts at the policy boundary';

  delete from public.message_team_members
  where team_id = created_team_id and user_id = invitee;
  select count(*) into n from public.message_thread_members
  where thread_id = created_thread_id and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: removed team member retained indirect thread access'; end if;
  raise notice 'PASS     team membership changes update thread access';

  insert into public.message_team_members (team_id, user_id, added_by)
  values (created_team_id, invitee, faria);
  delete from public.message_teams where id = created_team_id;
  select count(*) into n from public.message_thread_members
  where thread_id = created_thread_id and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: deleted team retained indirect thread access'; end if;
  select count(*) into n from public.message_thread_teams
  where thread_id = created_thread_id and team_id = created_team_id;
  if n <> 0 then raise exception 'FAIL: deleted team remained linked to its thread'; end if;
  raise notice 'PASS     deleting a team revokes its indirect thread access';

  reset role;
end $$;

-- ============ household directory management ============
do $$
declare
  faria uuid := '11111111-1111-1111-1111-111111111111';
  partner uuid := '33333333-3333-3333-3333-333333333333';
  invitee uuid := '44444444-4444-4444-4444-444444444444';
  faria_household uuid;
  removal_thread uuid;
  blocked boolean := false;
  n int;
begin
  select id into faria_household from public.households where owner_user_id = faria;
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', faria::text, true);
  perform public.update_household_member_role(partner, 'viewer');
  select count(*) into n from public.household_members
  where household_id = faria_household and user_id = partner and role = 'viewer';
  if n <> 1 then raise exception 'FAIL: owner could not update a household member role'; end if;

  blocked := false;
  begin
    perform public.remove_household_member(faria);
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: household owner removed their own membership'; end if;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  blocked := false;
  begin
    perform public.update_household_member_role(invitee, 'viewer');
  exception when others then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL: non-owner changed household member access'; end if;

  perform set_config('request.jwt.claim.sub', faria::text, true);
  removal_thread := public.create_message_thread(
    'Removal boundary', array[invitee], array[]::uuid[]
  );
  perform public.remove_household_member(invitee);
  select count(*) into n from public.household_members
  where household_id = faria_household and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: owner could not remove a household member'; end if;
  select count(*) into n from public.message_thread_members
  where thread_id = removal_thread and user_id = invitee;
  if n <> 0 then raise exception 'FAIL: removed member retained direct message access'; end if;
  select count(*) into n
  from public.message_thread_members as member
  join public.message_threads as thread on thread.id = member.thread_id
  where thread.household_id = faria_household
    and thread.is_family_thread
    and member.user_id = invitee;
  if n <> 0 then raise exception 'FAIL: removed member retained Family thread access'; end if;
  raise notice 'PASS     family directory role and removal controls are owner-only';

  reset role;
end $$;
