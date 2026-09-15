-- Let trackers/routines (collections) belong to a project/list Endeavour (another collection)
alter table collections
  add column if not exists collection_id text;
