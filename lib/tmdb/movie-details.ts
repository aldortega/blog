import { unstable_cache } from "next/cache";

type TmdbMovieDetailsResponse = {
  title?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string;
  credits?: {
    crew?: Array<{
      job?: string;
      name?: string;
    }>;
  };
};

export type TmdbMovieDetails = {
  title: string;
  releaseDate: string | null;
  overview: string | null;
  posterPath: string | null;
  director: string | null;
};

const TMDB_MOVIE_DETAILS_REVALIDATE_SECONDS = 60 * 60 * 6;

const fetchTmdbMovieDetailsCached = unstable_cache(
  async (tmdbId: number, apiKey: string): Promise<TmdbMovieDetails | null> => {
  const tmdbUrl = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  tmdbUrl.searchParams.set("api_key", apiKey);
  tmdbUrl.searchParams.set("append_to_response", "credits");
  tmdbUrl.searchParams.set("language", "es-ES");

  const response = await fetch(tmdbUrl, {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: TMDB_MOVIE_DETAILS_REVALIDATE_SECONDS,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as TmdbMovieDetailsResponse;
  const director =
    payload.credits?.crew?.find((member) => member.job === "Director")?.name?.trim() ?? null;
  const title = payload.title?.trim() ?? "";

  if (!title) {
    return null;
  }

  return {
    title,
    releaseDate: payload.release_date?.trim() || null,
    overview: payload.overview?.trim() || null,
    posterPath: payload.poster_path?.trim() || null,
    director,
  };
  },
  ["tmdb-movie-details"],
  { revalidate: TMDB_MOVIE_DETAILS_REVALIDATE_SECONDS },
);

export async function fetchTmdbMovieDetails(tmdbId: number): Promise<TmdbMovieDetails | null> {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey || !Number.isFinite(tmdbId) || tmdbId <= 0) {
    return null;
  }

  return fetchTmdbMovieDetailsCached(tmdbId, apiKey);
}
