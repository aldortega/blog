-- Fase 6 — Recomendaciones (home híbrido).
--
-- Dos RPC que agregan en Postgres (no en JS) sobre TODA la biblioteca, para las
-- secciones del home reestructurado:
--   1. trending_posts: más vistos en una ventana de N días, con fallback a all-time
--      cuando la ventana no alcanza a llenar el cupo (sitio nuevo / tráfico bajo).
--   2. top_rated_posts: mejor promedio de rating exigiendo un mínimo de votos
--      (evita que un único voto de 5★ encabece la sección).
-- Las secciones "recientes" y el historial del usuario (últimos N vistos distintos)
-- se resuelven con queries directas desde el server, sin RPC.
-- "Porque leíste X" reusa match_related_posts (fase 4).
--
-- Ambas son security invoker + stable y solo leen tablas con RLS de lectura pública
-- (content_views, ratings, posts), así que corren bien con el cliente público.

-- trending_posts --------------------------------------------------------------
-- Devuelve post_id + total de vistas (all-time) ordenado por relevancia de ventana.
-- has_window=1 para los posts con vistas dentro de la ventana: esos van primero,
-- ordenados por vistas de ventana; el resto rellena por vistas all-time. Así, si
-- menos de result_limit posts tienen actividad reciente, la sección igual se llena
-- con los más vistos históricos (fallback all-time pedido en el diseño).
create or replace function public.trending_posts(days int, result_limit int)
returns table (
  post_id uuid,
  views bigint,
  window_views bigint
)
language sql
stable
set search_path = public
as $$
  with alltime as (
    select cv.post_id, count(*) as v
    from public.content_views cv
    group by cv.post_id
  ),
  windowed as (
    select cv.post_id, count(*) as v
    from public.content_views cv
    where cv.created_at >= now() - make_interval(days => greatest(days, 1))
    group by cv.post_id
  ),
  ranked as (
    select
      a.post_id,
      a.v as views,
      coalesce(w.v, 0) as window_views,
      case when w.v is not null then 1 else 0 end as has_window
    from alltime a
    left join windowed w on w.post_id = a.post_id
  )
  select post_id, views, window_views
  from ranked
  order by
    has_window desc,
    case when has_window = 1 then window_views else views end desc,
    views desc,
    post_id
  limit greatest(result_limit, 1);
$$;

-- top_rated_posts -------------------------------------------------------------
-- Promedio de rating por post, exigiendo al menos min_votes votos. Ordena por
-- promedio desc, desempatando por cantidad de votos y luego post_id (estable).
create or replace function public.top_rated_posts(min_votes int, result_limit int)
returns table (
  post_id uuid,
  avg_score numeric,
  votes bigint
)
language sql
stable
set search_path = public
as $$
  select
    r.post_id,
    avg(r.score)::numeric as avg_score,
    count(*) as votes
  from public.ratings r
  group by r.post_id
  having count(*) >= greatest(min_votes, 1)
  order by avg(r.score) desc, count(*) desc, r.post_id
  limit greatest(result_limit, 1);
$$;
