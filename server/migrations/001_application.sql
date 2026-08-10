create extension if not exists pgcrypto;

update "user" set role = 'user' where role is null;

create table if not exists api_endpoints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null unique,
  enabled boolean not null default true,
  is_system boolean not null default false,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into api_endpoints (name, base_url, enabled, is_system)
values
  ('Commercial API', 'https://api.xiaomimimo.com/v1', true, true),
  ('Token Plan CN', 'https://token-plan-cn.xiaomimimo.com/v1', true, true)
on conflict (base_url) do update set name = excluded.name, is_system = true;

create table if not exists api_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  provider text not null,
  ciphertext bytea not null,
  iv bytea not null,
  auth_tag bytea not null,
  key_version integer not null default 1,
  last_four text not null,
  api_base_url text not null default 'https://api.xiaomimimo.com/v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table api_credentials add column if not exists api_base_url text not null default 'https://api.xiaomimimo.com/v1';

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('tts', 'timed', 'asr')),
  status text not null check (status in ('processing', 'completed', 'failed')),
  model text not null,
  input_preview text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generation_jobs_user_created_idx on generation_jobs (user_id, created_at desc);

create table if not exists audio_assets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  job_id uuid references generation_jobs(id) on delete set null,
  object_key text not null unique,
  title text not null,
  kind text not null check (kind in ('TTS', 'ASR')),
  voice text,
  transcript text,
  mime_type text not null,
  file_format text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  duration_seconds double precision,
  sha256 text not null,
  saved boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists audio_assets_user_created_idx on audio_assets (user_id, created_at desc) where deleted_at is null;

alter table audio_assets add column if not exists transcript_original text;
alter table audio_assets add column if not exists transcript_edited_at timestamptz;
alter table audio_assets add column if not exists generation_config jsonb not null default '{}'::jsonb;
alter table audio_assets add column if not exists usage jsonb;

update audio_assets
set transcript_original = transcript
where transcript is not null and transcript_original is null;

create table if not exists user_preferences (
  user_id text primary key references "user"(id) on delete cascade,
  api_base_url text not null default 'https://api.xiaomimimo.com/v1',
  sound_enabled boolean not null default true,
  preferred_voice text,
  preferred_format text,
  updated_at timestamptz not null default now()
);
