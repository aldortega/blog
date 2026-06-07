-- Fase 5 — Chatbot: registro de consultas para analítica de gaps de contenido.
--
-- Una fila por turno del chatbot que DISPARÓ una búsqueda en la biblioteca (no se
-- registran saludos ni turnos sin tool call). `query` es la consulta con la que el
-- modelo llamó a buscar_contenidos (lo que realmente se buscó, que puede diferir
-- del texto crudo del usuario). `had_results` indica si /api/search superó el
-- umbral. La fase 7 lee esto para detectar qué se pregunta y qué falta en el corpus.
--
-- RLS: select solo-admin (es analítica del dashboard); insert por usuario logueado
-- (el chatbot requiere login), forzando que user_id sea el usuario actual. No hay
-- update ni delete.

create table if not exists public.chatbot_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null check (length(btrim(query)) > 0),
  had_results boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chatbot_queries_created_at on public.chatbot_queries (created_at desc);
create index if not exists idx_chatbot_queries_had_results on public.chatbot_queries (had_results);

-- RLS ------------------------------------------------------------------------
alter table public.chatbot_queries enable row level security;

create policy chatbot_queries_admin_read on public.chatbot_queries
  for select to authenticated using ((select public.is_admin()));

create policy chatbot_queries_insert_own on public.chatbot_queries
  for insert to authenticated
  with check (user_id = (select auth.uid()));
