-- Migration to add a global settings table
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Insert default value for disable_ai
insert into public.site_settings (key, value)
values ('disable_ai', 'false'::jsonb)
on conflict (key) do nothing;

-- Enable Row Level Security
alter table public.site_settings enable row level security;

-- Policies
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);

create policy site_settings_admin_write on public.site_settings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
