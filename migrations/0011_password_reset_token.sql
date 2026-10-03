-- Allow password_reset on security_action_tokens.
alter table security_action_tokens drop constraint if exists security_action_tokens_action_check;
alter table security_action_tokens
  add constraint security_action_tokens_action_check
  check (action in ('new_device', 'phone_change', 'pin_change', 'password_reset'));
