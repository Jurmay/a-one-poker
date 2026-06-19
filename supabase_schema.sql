-- ============================================================
--  A-One Poker — Supabase Schema
--  Run this in your Supabase SQL Editor
-- ============================================================

-- Tables (holds live game state per table)
create table if not exists public.tables (
  id          text primary key,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.tables enable row level security;
create policy "Public read/write" on public.tables
  for all using (true) with check (true);

-- Hand history
create table if not exists public.hand_history (
  id          bigserial primary key,
  table_id    text not null references public.tables(id) on delete cascade,
  hand        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.hand_history enable row level security;
create policy "Public read/write" on public.hand_history
  for all using (true) with check (true);

-- Enable real-time for tables
alter publication supabase_realtime add table public.tables;
