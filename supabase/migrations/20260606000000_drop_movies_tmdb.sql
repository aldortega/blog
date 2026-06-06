-- Fase 0 — Limpieza de cine/TMDB.
--
-- El blog deja de modelar películas: se elimina la relación posts -> movies y la
-- tabla movies completa. "content" pasa a ser el concepto central (sin metadata
-- de TMDB). Las imágenes de portada (image_path) y el resto del modelo se conservan.

-- Quitar la FK + columna de posts hacia movies.
drop index if exists public.idx_posts_movie_id;
alter table public.posts drop column if exists movie_id;

-- Eliminar la tabla de películas (sus policies/índices/trigger caen con ella).
drop table if exists public.movies cascade;
