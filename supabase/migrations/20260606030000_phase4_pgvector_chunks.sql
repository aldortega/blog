-- Fase 4 — RAG por texto: pgvector + chunks de contenido.
--
-- 1. Habilita la extensión vector (pgvector 0.8.x ya disponible en el proyecto).
-- 2. content_chunks: un embedding por fragmento de post. chunk_text guarda el
--    párrafo crudo (para mostrar en resultados y para grounding del chatbot de la
--    fase 5); embedding es el vector 768d normalizado de gemini-embedding-2.
-- 3. Índice HNSW coseno para búsqueda semántica.
-- 4. RLS: lectura pública (búsqueda y relacionados son libres); escritura solo-admin
--    (el admin escribe con su cliente SSR autenticado, igual que el resumen IA).
-- 5. Dos funciones SQL: match_content_chunks (para /api/search) y
--    match_related_posts (similitud post-a-post para "artículos relacionados").

create extension if not exists vector;

-- content_chunks --------------------------------------------------------------
create table if not exists public.content_chunks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null check (length(btrim(chunk_text)) > 0),
  embedding vector(768) not null,
  created_at timestamptz not null default now(),
  unique (post_id, chunk_index)
);

create index if not exists idx_content_chunks_post_id on public.content_chunks (post_id);

-- HNSW + distancia coseno: gemini-embedding-2 normaliza las dims truncadas (768),
-- así que el coseno funciona directo. m/ef_construction quedan en los defaults.
create index if not exists idx_content_chunks_embedding
  on public.content_chunks using hnsw (embedding vector_cosine_ops);

-- RLS -------------------------------------------------------------------------
alter table public.content_chunks enable row level security;

create policy content_chunks_public_read on public.content_chunks
  for select to anon, authenticated using (true);
create policy content_chunks_admin_insert on public.content_chunks
  for insert to authenticated with check ((select public.is_admin()));
create policy content_chunks_admin_update on public.content_chunks
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy content_chunks_admin_delete on public.content_chunks
  for delete to authenticated using ((select public.is_admin()));

-- match_content_chunks: usado por /api/search. Recibe el embedding de la consulta
-- (gemini-embedding-2 con task prefix de query) y devuelve los chunks cuya similitud
-- coseno supera el umbral, ordenados por cercanía. <=> es la distancia coseno de
-- pgvector; similitud = 1 - distancia.
create or replace function public.match_content_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  post_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    cc.id,
    cc.post_id,
    cc.chunk_index,
    cc.chunk_text,
    1 - (cc.embedding <=> query_embedding) as similarity
  from public.content_chunks cc
  where 1 - (cc.embedding <=> query_embedding) >= match_threshold
  order by cc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- match_related_posts: similitud post-a-post para "artículos relacionados". Por
-- cada chunk del post dado busca sus vecinos más cercanos (usa el índice HNSW vía
-- lateral) y agrega por post quedándose con la MEJOR similitud (max-sim). Excluye
-- el propio post y los que no superan el umbral. Devuelve post_id + similitud.
create or replace function public.match_related_posts(
  p_post_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  post_id uuid,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    neighbor.post_id,
    max(neighbor.similarity) as similarity
  from public.content_chunks mine
  cross join lateral (
    select
      other.post_id,
      1 - (other.embedding <=> mine.embedding) as similarity
    from public.content_chunks other
    where other.post_id <> mine.post_id
    order by other.embedding <=> mine.embedding
    limit greatest(match_count, 1) * 4
  ) as neighbor
  where mine.post_id = p_post_id
  group by neighbor.post_id
  having max(neighbor.similarity) >= match_threshold
  order by similarity desc
  limit greatest(match_count, 1);
$$;
