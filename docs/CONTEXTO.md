# Contexto del proyecto — Repositorio de Sistemas Inteligentes

> Documento de contexto canónico para la migración. Refleja el **alcance acordado**
> (sesión de definición 2026-06-06), que hace cherry-pick entre el proyecto original
> y `../AI Library/docs/ESPECIFICACION.md`. **Ante cualquier conflicto, manda este
> documento, no la spec literal.**

## 1. Qué es

Migración del blog de cine **"Artificial Stories"** (en `C:\Users\Aldo\Desktop\blog`)
hacia un **Repositorio de Sistemas Inteligentes**: una biblioteca curada de artículos
de IA para una materia, con interacción de usuarios, foro de debate tipo Reddit,
búsqueda semántica (RAG) y un chatbot de texto con entrada por voz.

- **Prioridad:** calidad y completitud de features; la escala no es problema.

## 2. Roles y acceso

| Rol | Quién | Puede |
|-----|-------|-------|
| `admin` | 2 personas (marcadas a mano) | Crear/editar/borrar contenido, moderar todo, ver `/stats` |
| `user` | Logueados con Google | Comentar, puntuar, participar en el foro, usar el chatbot |
| anónimo | Sin login | Solo lectura |

- Regla general: **ver es libre; interactuar requiere login.**
- Auth: **solo Google OAuth** (sin email/password).
- Rol vía columna `role` en `profiles` (default `user`); los 2 admins se marcan a mano.
- Permisos forzados con **RLS** de Supabase.

## 3. Decisiones de alcance (la fuente de verdad)

### Lo que se conserva del proyecto original
- **Tema visual:** el oscuro custom actual (`#101418` / `#40fe6d`). **NO** se migra a shadcn.
- **Crear contenido:** se mantiene el flujo actual de "crear post", pero **solo admins**.
  **Sin panel CMS de gestión.**
- **Ratings:** como hoy (**0.5–5 medias estrellas**, único por usuario, editable, promedio).
- **Comentarios:** como hoy (**planos, texto plano, sin likes**, paginados de a 20;
  autor o admin borran).

### Lo que se adopta de la spec
- **Categorías:** sí. Cada contenido pertenece a **1** categoría. Se **crean al vuelo**
  desde el form de crear post (opción inline "+ Nueva categoría"). Las vistas por
  categoría reusan `/seccion/[slug]` (hoy stub).
- **RAG por texto:** chunking ~300–500 palabras, embeddings `gemini-embedding` **768d**,
  **pgvector** con **HNSW** + coseno, endpoint `/api/search` con **umbral** de similitud.
- **Chatbot:** de **texto**, con **entrada por voz** (grabar → transcribir en backend con
  Gemini → mandar como texto). Function calling sobre `/api/search`. **Requiere login.**
- **Recomendaciones:** home **híbrido** (no personalizado para anónimos; "Porque leíste X"
  para logueados) + tabla `content_views`.
- **Estadísticas:** una página **`/stats`** solo-lectura (admin) con **Recharts** +
  analítica del chatbot (`chatbot_queries`, detección de gaps de contenido).
- **Embeds:** solo **YouTube** (detectar URL → iframe responsivo).
- **Vistas por artículo:** se **muestran** al usuario.

### Foro tipo Reddit (más ambicioso que la spec)
- Cualquier **logueado** abre hilos y responde; el **admin** borra cualquier cosa.
- **Votos up + down**; orden con pestañas **Top** y **Nuevos** (sin "Hot").
- **Respuestas anidadas** con **tope de 3–4 niveles** + aplanado visual después (`parent_id`).
- **Hilo** = como un post (título + imagen opcional + Markdown);
  **respuestas** = como comentarios (texto liviano).
- **Vínculo opcional** del hilo a un artículo (`content_id` nullable).

### Lo que se descarta de la spec
- Borradores (publicación directa).
- Tags N:N.
- Comentarios en Markdown / con likes.
- Foro plano (se hizo Reddit).
- Live API de voz bidireccional / TTS (se reemplaza por chat de texto + transcripción).
- Caja de búsqueda separada (la búsqueda vive dentro del chatbot).
- Panel admin de gestión / shadcn.

## 4. Stack

- **Next.js 16.2.2 + React 19 + App Router + TypeScript** (ya en uso).
- **Supabase:** Auth (Google OAuth), Postgres + **pgvector**, Storage. Cliente `@supabase/ssr`.
- **Gemini** (`@google/genai`, ya integrado): resúmenes, embeddings, transcripción, chat.
- **Tailwind v4** + tema oscuro custom existente.
- **Recharts** (a sumar) para `/stats`.
- **Esquema versionado** con migraciones en `supabase/migrations`.
- Secretos: `.env.local` en dev. La API key de Gemini **solo en el servidor**.

## 5. Reutilización del proyecto base (~70%)

| Pieza | Ubicación | Estado |
|---|---|---|
| Clientes Supabase SSR | `lib/supabase/*` | Tal cual |
| Auth Google OAuth | `app/auth/*`, `components/auth-button.tsx` | Tal cual |
| `profiles` + avatares | `app/auth/callback`, `lib/avatar.ts` | + columna `role` |
| Markdown editor/renderer | `components/markdown-*` | + embeds YouTube |
| Comentarios | server actions en `app/post/[id]` | Tal cual |
| Ratings | `components/post-rating-*`, `rating-summary` | Tal cual |
| Subida de imágenes | `components/post-image-upload`, `api/posts/content-image` | Tal cual |
| Wiring de Gemini | `lib/ai/generate-post-summary.ts` | Patrón para embeddings/transcripción/RAG |
| Permisos | `lib/posts/permissions.ts` | Extender a gating admin |
| UI scaffolding | `app/layout.tsx`, `globals.css`, `SubmitButton`, header | Tal cual |

## 6. A eliminar (cine/TMDB)

`lib/tmdb/`, `app/api/tmdb/`, `components/movie-search.tsx`, tabla `movies`,
columna `posts.movie_id`, tarjeta lateral de película en `app/post/[id]/page.tsx`,
whitelist `image.tmdb.org` en renderer y `next.config.ts`.

## 7. Notas técnicas

- El esquema vive en Supabase directo; **faltan migraciones baseline** en el repo
  (solo hay 3 parches recientes). Hay que generar el baseline.
- La creación de contenido pasa de "cualquier logueado" a "solo admin".
- El patrón `after()` que ya usa el resumen automático sirve para disparar
  embeddings/chunking al crear un post.
- `rehype-sanitize` elimina iframes por defecto: los embeds de YouTube se hacen
  parseando la URL y renderizando el iframe nosotros, **sin** habilitar iframes
  arbitrarios en el sanitizer.

## 8. El plan

Ver `docs/PLAN.md`.
