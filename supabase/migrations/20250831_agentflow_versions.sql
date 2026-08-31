create table if not exists public.workflow_versions (
  id text primary key,
  workflow_id text not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nodes jsonb default '[]'::jsonb,
  edges jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_workflow_versions_workflow_id on public.workflow_versions(workflow_id);
create index if not exists idx_workflow_versions_user_id on public.workflow_versions(user_id);
alter table public.workflow_versions enable row level security;
drop policy if exists "Users can manage own workflow_versions" on public.workflow_versions;
create policy "Users can manage own workflow_versions" on public.workflow_versions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
