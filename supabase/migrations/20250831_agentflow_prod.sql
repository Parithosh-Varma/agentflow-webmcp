-- AgentFlow prod migration for Supabase (D1 parity)
-- Workflows, custom_nodes, execution_logs, templates with RLS per user

create extension if not exists "pgcrypto";

create table if not exists public.workflows (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  nodes jsonb default '[]'::jsonb,
  edges jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workflows_user_id on public.workflows(user_id);
create index if not exists idx_workflows_updated_at on public.workflows(updated_at);

create table if not exists public.custom_nodes (
  type text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  description text default '',
  color text default '#a8d8a8',
  icon text default 'CodeIcon',
  fields jsonb default '[]'::jsonb,
  code text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, type)
);
create index if not exists idx_custom_nodes_user_id on public.custom_nodes(user_id);

create table if not exists public.execution_logs (
  id text primary key,
  workflow_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  input jsonb default '{}'::jsonb,
  output jsonb default '{}'::jsonb,
  duration_ms integer default 0,
  status text default 'success',
  executed_at timestamptz default now()
);
create index if not exists idx_execution_logs_workflow_id on public.execution_logs(workflow_id);
create index if not exists idx_execution_logs_user_id on public.execution_logs(user_id);

create table if not exists public.templates (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  nodes jsonb default '[]'::jsonb,
  edges jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  unique(user_id, name)
);
create index if not exists idx_templates_user_id on public.templates(user_id);

alter table public.workflows enable row level security;
alter table public.custom_nodes enable row level security;
alter table public.execution_logs enable row level security;
alter table public.templates enable row level security;

drop policy if exists "Users can manage own workflows" on public.workflows;
create policy "Users can manage own workflows" on public.workflows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can manage own custom_nodes" on public.custom_nodes;
create policy "Users can manage own custom_nodes" on public.custom_nodes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can manage own execution_logs" on public.execution_logs;
create policy "Users can manage own execution_logs" on public.execution_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can manage own templates" on public.templates;
create policy "Users can manage own templates" on public.templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_updated_at() returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists set_updated_at_workflows on public.workflows;
create trigger set_updated_at_workflows before update on public.workflows for each row execute function public.handle_updated_at();
drop trigger if exists set_updated_at_custom_nodes on public.custom_nodes;
create trigger set_updated_at_custom_nodes before update on public.custom_nodes for each row execute function public.handle_updated_at();
