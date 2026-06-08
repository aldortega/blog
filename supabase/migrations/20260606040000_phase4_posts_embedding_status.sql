-- Fase 4 — estado de embeddings por post.
--
-- Espeja el patrón del resumen IA (ai_summary_status) para que el admin vea si un
-- post ya está indexado en el RAG. Como NO hay backfill masivo, estas columnas son
-- la señal de qué falta poblar a mano con el botón "regenerar embeddings".

alter table public.posts
  add column if not exists embeddings_status text not null default 'pending',
  add column if not exists embeddings_attempts integer not null default 0,
  add column if not exists embeddings_generated_at timestamptz,
  add column if not exists chunks_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_embeddings_status_check'
  ) then
    alter table public.posts
      add constraint posts_embeddings_status_check
      check (embeddings_status in ('pending', 'generating', 'ready', 'failed'));
  end if;
end $$;

create index if not exists idx_posts_embeddings_status on public.posts (embeddings_status);
