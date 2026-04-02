import { NextResponse } from "next/server";

type TmdbMovieResult = {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB no configurado." }, { status: 500 });
  }

  const tmdbUrl = new URL("https://api.themoviedb.org/3/search/movie");
  tmdbUrl.searchParams.set("api_key", apiKey);
  tmdbUrl.searchParams.set("query", query);
  tmdbUrl.searchParams.set("language", "es-ES");
  tmdbUrl.searchParams.set("include_adult", "false");
  tmdbUrl.searchParams.set("page", "1");

  const response = await fetch(tmdbUrl, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: "No se pudo consultar TMDB." }, { status: 502 });
  }

  const payload = (await response.json()) as { results?: TmdbMovieResult[] };

  const results = (payload.results ?? []).slice(0, 8).map((movie) => ({
    tmdb_id: movie.id,
    title: movie.title,
    release_date: movie.release_date || null,
    overview: movie.overview || null,
    poster_path: movie.poster_path || null,
  }));

  return NextResponse.json({ results });
}
