-- Shared GitHub identity for website (Supabase Auth) and VS Code (GitHub auth provider).
-- Apply to your hosted project with: supabase db push (or run SQL in the SQL editor).

alter table public.users
  add column if not exists github_id text;

create unique index if not exists users_github_id_key on public.users (github_id)
  where github_id is not null;

alter table public.users
  add column if not exists updated_at timestamptz default now();
