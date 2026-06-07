-- Fase 6 — Asistente de voz (Gemini Live API): canal de origen de la consulta.
--
-- El asistente de voz reusa la misma búsqueda semántica que el chatbot de texto y
-- registra sus consultas en la misma tabla de analítica. Agregamos `channel` para
-- poder distinguir, en el dashboard de gaps (fase 7), qué se preguntó por texto y
-- qué por voz. Las filas existentes (fase 5) son todas de texto, de ahí el default.

alter table public.chatbot_queries
  add column if not exists channel text not null default 'text'
    check (channel in ('text', 'voice'));

create index if not exists idx_chatbot_queries_channel on public.chatbot_queries (channel);
