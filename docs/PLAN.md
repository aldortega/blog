# Plan de migración por fases

> Refleja el alcance de `docs/CONTEXTO.md`. Cada fase deja algo funcionando y
> demostrable. Las fases son secuenciales salvo donde se indica que son independientes.

Estimación de esfuerzo relativo: 🟢 bajo · 🟡 medio · 🔴 alto.

---

## Fase 0 — Baseline y limpieza 🟢

**Objetivo:** modelo de contenido limpio y esquema versionado.

- Generar **migración baseline** del esquema actual (`profiles`, `posts`, `comments`,
  `ratings`) usando los tipos/estructura reales de Supabase, para versionarlo en
  `supabase/migrations/`.
- **Eliminar cine/TMDB:**
  - Borrar `lib/tmdb/`, `app/api/tmdb/`, `components/movie-search.tsx`.
  - Quitar la relación `movies` y la tarjeta lateral de película en `app/post/[id]/page.tsx`.
  - Migración: `drop table movies` + `alter table posts drop column movie_id`.
  - Limpiar imports/uso en `app/nuevo-post/page.tsx` y `app/post/[id]/editar/page.tsx`.
  - Quitar `image.tmdb.org` del whitelist en `markdown-renderer.tsx` y `next.config.ts`.
- Actualizar metadata y copys de cine en `app/layout.tsx`, home y form de creación.

**Demo:** la app funciona idéntica pero sin nada de películas.

---

## Fase 1 — Fundación: roles, categorías y RLS 🟡

**Objetivo:** modelo solo-admin para contenido + categorías + permisos forzados.

- Migración `add_role_to_profiles`: `role text not null default 'user'`. Marcar a mano
  los 2 admins.
- Migración `categories` (`id`, `name`, `slug`, `description`, `created_at`).
- Migración: `alter table posts add column category_id uuid references categories`.
  (Se mantiene el nombre `posts`; "content" es solo el concepto.)
- **Gating admin del flujo de creación:**
  - `app/nuevo-post/page.tsx`: chequear `role='admin'` (no solo login). Redirigir si no.
  - Extender `lib/posts/permissions.ts` con `canManageContent` basado en rol admin.
- **Categorías al vuelo:** en el form, `<select>` de categoría con opción
  "+ Nueva categoría" → server action que crea la categoría (solo admin) y la asigna.
- **RLS:**
  - `posts`/`categories`: `select` público; `insert/update/delete` solo `role='admin'`.
  - `comments`/`ratings`: `select` público; `insert` solo logueados; borrar = autor o admin.

**Demo:** admin crea categoría al vuelo y publica en ella; un user normal no puede crear; RLS bloquea lo correcto.

---

## Fase 2 — Biblioteca pública + embeds + vistas 🟡

**Objetivo:** navegación por categoría, video y contador de vistas.

- **`/seccion/[slug]`** (hoy stub): listado de posts de la categoría.
- Home y header: links a categorías; el feed sigue siendo el actual (orden por rating/fecha).
- **Embeds de YouTube** en `markdown-renderer.tsx`: detectar URLs de YouTube → iframe
  responsivo (sin habilitar iframes en `rehype-sanitize`).
- Migración `content_views` (`id`, `post_id`, `user_id` nullable, `created_at`).
- Registrar vista al abrir `app/post/[id]` (logueado o anónimo).
- **Mostrar el contador de vistas** en la página del post, junto a rating y comentarios.

**Demo:** navegás por categoría, ves un post con video embebido y su contador de vistas.

---

## Fase 3 — Foro tipo Reddit 🔴 *(independiente del RAG; puede ir en paralelo)*

**Objetivo:** debate comunitario con votos y anidado. Es el módulo más grande.

- Migraciones:
  - `forum_threads` (`id`, `author_id`, `category_id`, `content_id` **nullable**,
    `title`, `body` Markdown, `image_path` nullable, `created_at`).
  - `forum_posts` (respuestas): `id`, `thread_id`, `author_id`, `parent_id` **nullable**
    (árbol), `body`, `created_at`.
  - `forum_votes` (`user_id`, `target_type` thread|post, `target_id`, `value` +1/-1,
    `UNIQUE(user_id, target_type, target_id)`).
- **RLS:** leer público; crear/votar solo logueados; borrar = autor o admin.
- Vistas:
  - `/foro` (o `/seccion/[slug]/foro`): hilos por categoría, pestañas **Top** / **Nuevos**.
  - `/foro/[threadId]`: hilo (reusa estilo de post) + respuestas **anidadas**
    (tope visual 3–4 niveles, aplanar después) con votos up/down.
  - Crear hilo: reusa el flujo de crear post (imagen opcional, categoría, vínculo
    opcional a artículo). Responder: reusa el textarea de comentarios.
- En `app/post/[id]`: sección "Debates relacionados" si hay hilos con ese `content_id`.

**Demo:** abrís un hilo, otros responden anidado y votan; orden Top/Nuevos funciona; admin modera.

---

## Fase 4 — RAG por texto 🔴

**Objetivo:** búsqueda semántica sobre la biblioteca.

- Migración: habilitar `pgvector`; tabla `content_chunks` (`id`, `post_id`,
  `chunk_text`, `embedding vector(768)`); índice **HNSW** coseno.
- `lib/ai/embeddings.ts` (reusa patrón de `generate-post-summary.ts`): chunking por
  secciones (~300–500 palabras, respetando párrafos/encabezados) + `gemini-embedding` 768d.
- Generar/regenerar chunks+embeddings **al crear/editar** post, dentro del `after()`
  (igual que el resumen actual).
- **`/api/search`** (Route Handler): consulta → embedding → match pgvector con **umbral**;
  si nada supera el umbral → "no hay contenido sobre eso".
- **Artículos relacionados** por similitud semántica en `app/post/[id]` (reemplaza el
  bloque actual "Colección destacada" ordenado por rating).

**Demo:** consultás `/api/search` y devuelve artículos por similitud; relacionados reales en el post.

---

## Fase 5 — Chatbot de texto + entrada por voz 🔴

**Objetivo:** asistente conversacional grounded en la biblioteca.

- UI de chat (Client Component), **gateada a login**.
- Backend: conversación con Gemini + **function calling** → tool `buscar_contenidos(consulta)`
  → `/api/search` (fase 4). Respuesta = resumen anclado a fuentes + artículos recomendados.
- **Entrada por voz:** grabar audio en el cliente → `/api/transcribe` (backend) →
  Gemini transcribe → texto vuelve al input → se manda como pregunta de texto.
- Migración `chatbot_queries` (`id`, `user_id`, `query`, `had_results` bool, `created_at`)
  para la analítica de la fase 7.

**Demo:** preguntás por texto o por voz; el bot responde con fuentes; si no hay contenido, lo dice.

---

## Fase 6 — Recomendaciones (home híbrido) 🟡

**Objetivo:** descubrimiento personalizado.

- Home **no personalizado** (anónimos/todos): secciones más puntuados / recientes / tendencias.
- Home **personalizado** (logueados): fila **"Porque leíste X"** → vecinos por embedding
  del último artículo visto (usa `content_views` de fase 2 + embeddings de fase 4).

**Demo:** un logueado con historial ve la fila "Porque leíste X"; un anónimo ve el home no personalizado.

---

## Fase 7 — Estadísticas `/stats` 🟡

**Objetivo:** dashboard solo-lectura para admins.

- Página **`/stats`** gateada a admin (no es un CMS, es un único dashboard de lectura).
- Sumar **Recharts**.
- Métricas: artículos top (vistas/rating), categorías populares, actividad en el tiempo.
- **Analítica del chatbot:** qué se pregunta y cuántas consultas terminaron en
  "no hay contenido" (`chatbot_queries`) → **detección de gaps de contenido**.

**Demo:** admin abre `/stats` y ve gráficos + los gaps de contenido del chatbot.

---

## Orden y dependencias

```
Fase 0 → Fase 1 → Fase 2 ┐
                          ├→ Fase 3 (foro, independiente)
                          └→ Fase 4 (RAG) → Fase 5 (chatbot) → Fase 7 (stats)
                                          ↘ Fase 6 (recos, usa views+embeddings)
```

- Fase 3 (foro) no depende del RAG: puede hacerse en paralelo o cuando se quiera.
- Fase 6 necesita `content_views` (fase 2) + embeddings (fase 4).
- Fase 7 necesita `content_views` (fase 2) + `chatbot_queries` (fase 5).

## Dependencias nuevas

- `recharts` (pnpm, fase 7).
- `pgvector` (extensión Postgres vía migración, fase 4 — no es paquete pnpm).
