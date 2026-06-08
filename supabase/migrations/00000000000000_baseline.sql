-- Baseline del esquema del blog "Artificial Stories" (pre-migración).
--
-- Captura el estado real de Supabase (proyecto BlogAI) tal como existía antes de la
-- migración al Repositorio de Sistemas Inteligentes. Las migraciones individuales
-- ya estaban aplicadas en la base remota; este archivo existe para versionar el
-- esquema completo en el repo (antes solo había parches sueltos).
--
-- NO re-aplicar sobre la base remota: ya está presente. Sirve como punto de partida
-- reproducible (p. ej. para levantar el stack local con `supabase db reset`).
--
-- Las fases posteriores (drop de movies/TMDB, roles, categorías, foro, RAG, etc.)
-- se versionan como migraciones nuevas encima de este baseline.

-- Extensiones ------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Función utilitaria: mantener updated_at -------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles --------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id),
  display_name text,
  avatar_url text,
  role text not null default 'author' check (role = any (array['author', 'admin'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- movies (cine/TMDB; se elimina en la Fase 0 de la migración) ------------------
create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null unique,
  title text not null,
  original_title text,
  overview text,
  release_date date,
  poster_path text,
  backdrop_path text,
  director text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_movies_updated_at
  before update on public.movies
  for each row execute function public.set_updated_at();

-- posts -----------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  movie_id uuid references public.movies (id),
  title text not null,
  excerpt text,
  content text not null,
  image_path text check (image_path is null or length(btrim(image_path)) > 0),
  ai_summary text,
  ai_summary_status text not null default 'pending'
    check (ai_summary_status = any (array['pending', 'generating', 'ready', 'failed'])),
  ai_summary_attempts integer not null default 0,
  ai_summary_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_posts_author_id on public.posts (author_id);
create index if not exists idx_posts_movie_id on public.posts (movie_id);
create index if not exists idx_posts_created_at_desc on public.posts (created_at desc);
create index if not exists idx_posts_ai_summary_status on public.posts (ai_summary_status);

create trigger trg_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- comments --------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id),
  author_id uuid not null references public.profiles (id),
  content text not null check (length(btrim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_comments_author_id on public.comments (author_id);
create index if not exists comments_post_id_created_at_idx on public.comments (post_id, created_at);

create trigger trg_comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ratings (medias estrellas 0.5–5.0, único por usuario) -----------------------
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id),
  user_id uuid not null references public.profiles (id),
  score numeric not null check (score >= 0.5 and score <= 5.0 and mod(score * 2, 1) = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists idx_ratings_post_id on public.ratings (post_id);
create index if not exists idx_ratings_user_id on public.ratings (user_id);

create trigger trg_ratings_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

-- Alta de perfil al registrarse vía auth --------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS -------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.movies enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.ratings enable row level security;

-- profiles
create policy profiles_public_read on public.profiles for select to public using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- movies
create policy movies_public_read on public.movies for select to public using (true);
create policy movies_authenticated_upsert on public.movies for all to public
  using (true)
  with check (((tmdb_id > 0) and (length(btrim(title)) > 0)) or (tmdb_id <= 0));

-- posts
create policy posts_public_read on public.posts for select to public using (true);
create policy posts_insert_own on public.posts for insert to authenticated with check ((select auth.uid()) = author_id);
create policy posts_update_own on public.posts for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy posts_update_author_or_admin on public.posts for update to authenticated
  using ((auth.uid() = author_id) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check ((auth.uid() = author_id) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy posts_delete_own on public.posts for delete to authenticated using ((select auth.uid()) = author_id);
create policy posts_delete_author_or_admin on public.posts for delete to authenticated
  using ((auth.uid() = author_id) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- comments
create policy comments_public_read on public.comments for select to anon, authenticated using (true);
create policy comments_select_public on public.comments for select to anon, authenticated using (true);
create policy comments_insert_own on public.comments for insert to authenticated with check ((select auth.uid()) = author_id);
create policy comments_insert_authenticated on public.comments for insert to authenticated
  with check ((auth.uid() = author_id) and (char_length(btrim(content)) > 0));
create policy comments_update_own on public.comments for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy comments_delete_own on public.comments for delete to authenticated using ((select auth.uid()) = author_id);
create policy comments_delete_author_or_admin on public.comments for delete to authenticated
  using ((auth.uid() = author_id) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ratings
create policy ratings_public_read on public.ratings for select to anon, authenticated using (true);
create policy ratings_insert_own on public.ratings for insert to authenticated with check (auth.uid() = user_id);
create policy ratings_update_own on public.ratings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ratings_delete_own on public.ratings for delete to authenticated using (auth.uid() = user_id);

-- Storage: bucket público de imágenes de posts --------------------------------
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

create policy post_images_public_read on storage.objects for select to public
  using (bucket_id = 'post-images');
create policy post_images_auth_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and owner = (select auth.uid()));
create policy post_images_auth_update on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and owner = (select auth.uid()))
  with check (bucket_id = 'post-images' and owner = (select auth.uid()));
create policy post_images_auth_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and owner = (select auth.uid()));

-- Realtime: el blog escucha cambios en posts (sync de estado del resumen IA) ---
alter publication supabase_realtime add table public.posts;
