create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text,
  email text,
  role text default 'user',
  created_at timestamptz default now()
);

create table if not exists matters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete cascade,
  name text not null,
  client text,
  project text,
  practice_area text,
  jurisdiction text,
  notes text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists matter_files (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid references matters(id) on delete cascade,
  owner_id uuid references users(id) on delete cascade,
  file_name text not null,
  file_type text,
  storage_path text,
  origin text default 'manual',
  status text default 'uploaded',
  note text,
  created_at timestamptz default now()
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid references matters(id) on delete cascade,
  owner_id uuid references users(id) on delete cascade,
  title text,
  module_name text default 'assistant',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists generated_documents (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid references matters(id) on delete cascade,
  owner_id uuid references users(id) on delete cascade,
  module_name text not null,
  title text not null,
  content text,
  export_type text,
  created_at timestamptz default now()
);

create table if not exists notice_requests (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid references matters(id) on delete cascade,
  owner_id uuid references users(id) on delete cascade,
  recipient_name text,
  recipient_address text,
  subject text,
  facts text,
  demand_text text,
  generated_document_id uuid references generated_documents(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists module_runs (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid references matters(id) on delete cascade,
  owner_id uuid references users(id) on delete cascade,
  module_name text not null,
  input_data jsonb default '{}'::jsonb,
  output_data jsonb default '{}'::jsonb,
  status text default 'completed',
  created_at timestamptz default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete cascade,
  theme text default 'light-harvey',
  locale text default 'en',
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_matters_owner_id on matters(owner_id);
create index if not exists idx_matter_files_matter_id on matter_files(matter_id);
create index if not exists idx_threads_matter_id on threads(matter_id);
create index if not exists idx_messages_thread_id on messages(thread_id);
create index if not exists idx_generated_documents_matter_id on generated_documents(matter_id);
create index if not exists idx_notice_requests_matter_id on notice_requests(matter_id);
create index if not exists idx_module_runs_matter_id on module_runs(matter_id);
create index if not exists idx_settings_owner_id on settings(owner_id);

-- recommended storage buckets to create in Supabase:
-- matter-files
-- generated-docs
-- avatars
