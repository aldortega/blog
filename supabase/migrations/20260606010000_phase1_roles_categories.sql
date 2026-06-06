-- Fase 1 — Fundación: roles, categorías y RLS admin.
--
-- 1. Rol base de profiles pasa de 'author' a 'user' (alinea con el modelo nuevo:
--    "ver es libre; interactuar requiere login; solo admin gestiona contenido").
-- 2. Categorías curadas (1 por contenido), creables al vuelo solo por admin.
-- 3. posts.category_id (nullable: los posts viejos quedan sin categoría hasta editarse).
-- 4. RLS: posts y categories son escritura solo-admin; lectura pública.
--    comments/ratings se dejan como el baseline (insert logueado, borrar autor o admin).

-- Rol base: 'author' -> 'user' ------------------------------------------------
-- Se quita el check viejo ANTES del update: el constraint anterior solo permite
-- ('author','admin') y rechazaría las filas mientras pasan a 'user'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column role set default 'user';
update public.profiles set role = 'user' where role = 'author';
alter table public.profiles
  add constraint profiles_role_check check (role = any (array['user', 'admin']));

-- Admin marcado a mano (segundo admin: TODO, marcar cuando se defina) ----------
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id and u.email = 'aldoortega1234@gmail.com';

-- Helper: ¿el usuario actual es admin? (evita repetir el subquery en cada policy)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- categories ------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  slug text not null unique check (length(btrim(slug)) > 0),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_slug on public.categories (slug);

-- posts.category_id -----------------------------------------------------------
alter table public.posts
  add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists idx_posts_category_id on public.posts (category_id);

-- RLS: categories -------------------------------------------------------------
alter table public.categories enable row level security;

create policy categories_public_read on public.categories
  for select to anon, authenticated using (true);
create policy categories_admin_insert on public.categories
  for insert to authenticated with check ((select public.is_admin()));
create policy categories_admin_update on public.categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_admin_delete on public.categories
  for delete to authenticated using ((select public.is_admin()));

-- RLS: posts pasa a escritura solo-admin --------------------------------------
-- Se retiran las policies basadas en autor (el modelo viejo dejaba escribir a
-- cualquier logueado dueño del post). Ahora todo el CRUD de contenido es admin.
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_update_author_or_admin on public.posts;
drop policy if exists posts_delete_own on public.posts;
drop policy if exists posts_delete_author_or_admin on public.posts;

create policy posts_admin_insert on public.posts
  for insert to authenticated with check ((select public.is_admin()));
create policy posts_admin_update on public.posts
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy posts_admin_delete on public.posts
  for delete to authenticated using ((select public.is_admin()));
