-- Loan repayment was blocked by CHECK (balance_due_tambala > 0)
-- because closing a loan sets balance_due_tambala = 0.
alter table loans drop constraint if exists loans_balance_due_tambala_check;

alter table loans
  add constraint loans_balance_due_tambala_check
  check (balance_due_tambala >= 0);

-- Also allow paid/closed rows to keep zero due.
