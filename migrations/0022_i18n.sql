-- Multi-language: admin drafts, publish, enable languages
create table if not exists app_languages (
  code text primary key,
  name text not null,
  enabled boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app_languages (code, name, enabled, is_default)
values
  ('en', 'English', true, true),
  ('ny', 'Chichewa', false, false)
on conflict (code) do nothing;

create table if not exists app_translations (
  lang_code text not null references app_languages(code) on delete cascade,
  msg_key text not null,
  draft_value text,
  published_value text,
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  primary key (lang_code, msg_key)
);

create index if not exists app_translations_lang_idx on app_translations (lang_code);
