create table if not exists docs (
  collection text not null, id text not null, user_id text,
  data jsonb not null, created_at timestamptz default now(), updated_at timestamptz default now(),
  primary key (collection, id));
create index if not exists docs_user_idx on docs (collection, user_id);
alter table docs enable row level security; -- server uses the service role key; no public policies
