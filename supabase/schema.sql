create table if not exists public.workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

drop policy if exists "read own workspace" on public.workspaces;
create policy "read own workspace"
  on public.workspaces for select
  using (auth.uid() = user_id);

drop policy if exists "insert own workspace" on public.workspaces;
create policy "insert own workspace"
  on public.workspaces for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own workspace" on public.workspaces;
create policy "update own workspace"
  on public.workspaces for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own workspace" on public.workspaces;
create policy "delete own workspace"
  on public.workspaces for delete
  using (auth.uid() = user_id);
