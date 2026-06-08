-- Fase 3 — Foro tipo Reddit.
--
-- Debate comunitario con hilos (estilo post: título + imagen opcional + Markdown),
-- respuestas anidadas (árbol vía parent_id) y votos up/down con orden Top/Nuevos.
--
-- Decisiones de diseño (ver docs/CONTEXTO.md y la sesión de grilling):
--  - Cualquier logueado crea hilos y responde; el admin modera todo.
--  - Voto propio permitido, sin auto-voto (score arranca en 0).
--  - Score y reply_count DESNORMALIZADOS, mantenidos por triggers SECURITY DEFINER
--    (recalculan desde forum_votes / forum_posts, así Top se ordena indexado).
--  - Respuestas: SOFT-DELETE (is_deleted) para conservar el árbol al moderar un nodo.
--  - Hilo: HARD-DELETE con cascade de respuestas + votos (no hay conversación que
--    preservar si se borra el hilo entero).
--  - forum_votes es polimórfico (target_type thread|post); sin FK al target, se
--    valida por CHECK + app + triggers.

-- forum_threads ---------------------------------------------------------------
create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  category_id uuid not null references public.categories (id),
  content_id uuid references public.posts (id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0),
  image_path text check (image_path is null or length(btrim(image_path)) > 0),
  score integer not null default 0,
  reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_forum_threads_category_id on public.forum_threads (category_id);
create index if not exists idx_forum_threads_content_id on public.forum_threads (content_id);
create index if not exists idx_forum_threads_created_at_desc on public.forum_threads (created_at desc);
create index if not exists idx_forum_threads_score_desc on public.forum_threads (score desc, created_at desc);

create trigger trg_forum_threads_updated_at
  before update on public.forum_threads
  for each row execute function public.set_updated_at();

-- forum_posts (respuestas, árbol vía parent_id) -------------------------------
create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  parent_id uuid references public.forum_posts (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  score integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_forum_posts_thread_id on public.forum_posts (thread_id);
create index if not exists idx_forum_posts_parent_id on public.forum_posts (parent_id);

create trigger trg_forum_posts_updated_at
  before update on public.forum_posts
  for each row execute function public.set_updated_at();

-- forum_votes (polimórfico: thread | post) ------------------------------------
create table if not exists public.forum_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  target_type text not null check (target_type = any (array['thread', 'post'])),
  target_id uuid not null,
  value smallint not null check (value = any (array[-1, 1])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create index if not exists idx_forum_votes_target on public.forum_votes (target_type, target_id);

create trigger trg_forum_votes_updated_at
  before update on public.forum_votes
  for each row execute function public.set_updated_at();

-- Trigger: recalcular score del target ----------------------------------------
-- SECURITY DEFINER para que el UPDATE del score no quede sujeto a la RLS del
-- usuario que votó (no hay policy de update de score en threads/posts).
create or replace function public.forum_recalc_score()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_type text;
  v_id uuid;
begin
  v_type := coalesce(new.target_type, old.target_type);
  v_id := coalesce(new.target_id, old.target_id);

  if v_type = 'thread' then
    update public.forum_threads t
    set score = coalesce(
      (select sum(v.value) from public.forum_votes v
        where v.target_type = 'thread' and v.target_id = v_id),
      0)
    where t.id = v_id;
  elsif v_type = 'post' then
    update public.forum_posts p
    set score = coalesce(
      (select sum(v.value) from public.forum_votes v
        where v.target_type = 'post' and v.target_id = v_id),
      0)
    where p.id = v_id;
  end if;

  return null;
end;
$$;

create trigger trg_forum_votes_recalc
  after insert or update or delete on public.forum_votes
  for each row execute function public.forum_recalc_score();

-- Trigger: recalcular reply_count del hilo (solo respuestas no borradas) -------
create or replace function public.forum_recalc_reply_count()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_thread_id uuid;
begin
  v_thread_id := coalesce(new.thread_id, old.thread_id);

  update public.forum_threads t
  set reply_count = coalesce(
    (select count(*) from public.forum_posts p
      where p.thread_id = v_thread_id and p.is_deleted = false),
    0)
  where t.id = v_thread_id;

  return null;
end;
$$;

create trigger trg_forum_posts_reply_count
  after insert or update or delete on public.forum_posts
  for each row execute function public.forum_recalc_reply_count();

-- RLS -------------------------------------------------------------------------
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_votes enable row level security;

-- forum_threads: lectura pública; crear logueado (autor = uno mismo);
-- editar/borrar = autor o admin. (Sin policy de score: lo toca el trigger definer.)
create policy forum_threads_public_read on public.forum_threads
  for select to anon, authenticated using (true);
create policy forum_threads_insert_own on public.forum_threads
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy forum_threads_update_author_or_admin on public.forum_threads
  for update to authenticated
  using ((auth.uid() = author_id) or (select public.is_admin()))
  with check ((auth.uid() = author_id) or (select public.is_admin()));
create policy forum_threads_delete_author_or_admin on public.forum_threads
  for delete to authenticated
  using ((auth.uid() = author_id) or (select public.is_admin()));

-- forum_posts: lectura pública; crear logueado; update (soft-delete) y delete =
-- autor o admin. El hard-delete real ocurre por cascade al borrar el hilo.
create policy forum_posts_public_read on public.forum_posts
  for select to anon, authenticated using (true);
create policy forum_posts_insert_own on public.forum_posts
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy forum_posts_update_author_or_admin on public.forum_posts
  for update to authenticated
  using ((auth.uid() = author_id) or (select public.is_admin()))
  with check ((auth.uid() = author_id) or (select public.is_admin()));
create policy forum_posts_delete_author_or_admin on public.forum_posts
  for delete to authenticated
  using ((auth.uid() = author_id) or (select public.is_admin()));

-- forum_votes: cada quien gestiona su propio voto. Lectura solo del propio voto
-- (el score agregado vive desnormalizado en el target y es público vía la fila).
create policy forum_votes_select_own on public.forum_votes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy forum_votes_insert_own on public.forum_votes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy forum_votes_update_own on public.forum_votes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy forum_votes_delete_own on public.forum_votes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Storage: bucket público de imágenes del foro (subidas por cualquier logueado) --
-- Separado de post-images (contenido curado de admin) para poder aplicar
-- políticas/limpieza distintas al contenido de usuarios.
insert into storage.buckets (id, name, public)
values ('forum-images', 'forum-images', true)
on conflict (id) do nothing;

create policy forum_images_public_read on storage.objects for select to public
  using (bucket_id = 'forum-images');
create policy forum_images_auth_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'forum-images' and owner = (select auth.uid()));
create policy forum_images_auth_update on storage.objects for update to authenticated
  using (bucket_id = 'forum-images' and owner = (select auth.uid()))
  with check (bucket_id = 'forum-images' and owner = (select auth.uid()));
create policy forum_images_auth_delete on storage.objects for delete to authenticated
  using (bucket_id = 'forum-images' and owner = (select auth.uid()));
