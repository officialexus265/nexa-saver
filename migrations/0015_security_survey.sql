-- Anchor contact details (first registered) for security survey revert.
alter table profiles
  add column if not exists anchor_email text,
  add column if not exists anchor_phone text;

-- Backfill anchors from current values for existing users.
update profiles
set anchor_email = coalesce(anchor_email, email),
    anchor_phone = coalesce(anchor_phone, phone)
where anchor_email is null or anchor_phone is null;

-- Per-user completion of the active survey campaign.
create table if not exists security_survey_completions (
  user_id text primary key references "user"(id) on delete cascade,
  campaign_id text not null,
  email_confirmed boolean not null,
  phone_confirmed boolean not null,
  security_answer_ok boolean not null,
  reverted_email boolean not null default false,
  reverted_phone boolean not null default false,
  completed_at timestamptz not null default now()
);

create index if not exists security_survey_completions_campaign_idx
  on security_survey_completions (campaign_id);

insert into platform_settings (key, value)
values
  ('security_survey_active', 'false'),
  ('security_survey_campaign_id', ''),
  ('security_survey_started_at', '')
on conflict (key) do nothing;
