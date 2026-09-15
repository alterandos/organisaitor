-- Sunset (soft-delete) support for Endeavours and Purposes
alter table collections
  add column if not exists archived_at timestamptz;

alter table purposes
  add column if not exists archived_at timestamptz;
