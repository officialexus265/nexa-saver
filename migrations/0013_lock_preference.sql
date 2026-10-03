-- User-configurable vault PIN lock behaviour.
alter table profiles
  add column if not exists lock_mode text not null default 'idle';

alter table profiles
  drop constraint if exists profiles_lock_mode_check;

alter table profiles
  add constraint profiles_lock_mode_check
  check (lock_mode in ('instant', 'idle'));

alter table profiles
  add column if not exists lock_idle_minutes integer not null default 5;

alter table profiles
  drop constraint if exists profiles_lock_idle_minutes_check;

alter table profiles
  add constraint profiles_lock_idle_minutes_check
  check (lock_idle_minutes >= 1 and lock_idle_minutes <= 60);

comment on column profiles.lock_mode is
  'instant = lock when app backgrounds; idle = lock after lock_idle_minutes without interaction';
