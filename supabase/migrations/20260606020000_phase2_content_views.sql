-- Fase 2 — Biblioteca pública: contador de vistas por artículo.
--
-- Registra una fila por apertura de un post (logueado o anónimo). El user_id es
-- nullable: las visitas anónimas quedan sin usuario. on delete cascade limpia las
-- vistas cuando se borra el post; on delete set null conserva la vista si se borra
-- el perfil. La fase 6 (recomendaciones) y la fase 7 (stats) reutilizan esta tabla.

create table if not exists public.content_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_views_post_id on public.content_views (post_id);
create index if not exists idx_content_views_user_id on public.content_views (user_id);
create index if not exists idx_content_views_created_at on public.content_views (created_at desc);

-- RLS: lectura pública (para mostrar el contador y la analítica); insertar lo
-- puede hacer cualquiera (anónimo o logueado). Si la visita trae usuario, debe ser
-- el usuario actual; las visitas anónimas (user_id null) quedan permitidas.
alter table public.content_views enable row level security;

create policy content_views_public_read on public.content_views
  for select to anon, authenticated using (true);

create policy content_views_insert on public.content_views
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
