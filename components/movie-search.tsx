"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Film, Search } from "lucide-react";

export type MovieSearchResult = {
  tmdb_id: number;
  title: string;
  release_date: string | null;
  overview: string | null;
  poster_path?: string | null;
};

type MovieSearchProps = {
  initialMovie?: MovieSearchResult | null;
};

function formatMovieLabel(movie: MovieSearchResult) {
  const year = movie.release_date?.slice(0, 4);
  return year ? `${movie.title} (${year})` : `${movie.title} (----)`;
}

function toTmdbPosterUrl(posterPath?: string | null) {
  if (!posterPath) {
    return null;
  }

  return `https://image.tmdb.org/t/p/w780${posterPath}`;
}

export default function MovieSearch({ initialMovie = null }: MovieSearchProps) {
  const [query, setQuery] = useState(initialMovie ? formatMovieLabel(initialMovie) : "");
  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResult | null>(initialMovie);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!initialMovie) {
      return;
    }

    setSelectedMovie(initialMovie);
    setQuery(formatMovieLabel(initialMovie));
  }, [initialMovie]);

  useEffect(() => {
    if (selectedMovie && trimmedQuery === formatMovieLabel(selectedMovie)) {
      return;
    }

    setSelectedMovie(null);

    if (trimmedQuery.length < 2) {
      setResults([]);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("tmdb_search_failed");
        }

        const payload = (await response.json()) as { results?: MovieSearchResult[] };
        setResults(payload.results ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setErrorMessage("No se pudo buscar peliculas. Intenta nuevamente.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [trimmedQuery, selectedMovie]);

  function handleSelectMovie(movie: MovieSearchResult) {
    setSelectedMovie(movie);
    setQuery(formatMovieLabel(movie));
    setResults([]);
    setErrorMessage(null);
    setIsLoading(false);
  }

  const showDropdown = !selectedMovie && trimmedQuery.length >= 2;
  const selectedPosterUrl = toTmdbPosterUrl(selectedMovie?.poster_path);

  return (
    <div className="bg-[#181c20] rounded-xl p-6 flex flex-col min-h-[160px]">
      <div className="flex items-center gap-2 mb-4 text-[#40fe6d] text-xs font-bold tracking-widest uppercase">
        <Film className="h-4 w-4" />
        <span>Pelicula</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative h-[144px] w-[102px] overflow-hidden rounded-md border border-[#3c4b3a]/50 bg-[#0b0f12] shrink-0">
          {selectedPosterUrl ? (
            <Image
              src={selectedPosterUrl}
              quality={80}
              alt={`Portada de ${selectedMovie?.title ?? "pelicula seleccionada"}`}
              fill
              sizes="102px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#bacbb6]/70">
              <Film className="h-5 w-5" />
              <span className="text-[9px] font-bold tracking-widest uppercase">Sin portada</span>
            </div>
          )}
        </div>

        <div className="relative flex-1">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pelicula"
            className="h-[44px] w-full bg-[#0b0f12] rounded-lg border border-[#3c4b3a]/30 px-3 pr-10 text-sm text-white placeholder:text-[#bacbb6] outline-none focus:border-[#43fe6d] focus:ring-1 focus:ring-[#43fe6d] transition-all font-body"
          />
          <Search className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#bacbb6]" />

          {showDropdown ? (
            <div className="absolute z-20 mt-2 w-full rounded-lg border border-[#3c4b3a]/40 bg-[#0b0f12] shadow-2xl">
              {isLoading ? (
                <p className="px-4 py-3 text-sm text-[#bacbb6]">Buscando...</p>
              ) : errorMessage ? (
                <p className="px-4 py-3 text-sm text-rose-300">{errorMessage}</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[#bacbb6]">Sin resultados.</p>
              ) : (
                <ul className="max-h-64 overflow-y-auto py-1">
                  {results.map((movie) => (
                    <li key={movie.tmdb_id}>
                      <button
                        type="button"
                        onClick={() => handleSelectMovie(movie)}
                        className="w-full px-4 py-2.5 text-left text-sm text-[#e0e3e8] hover:bg-[#141a1e]"
                      >
                        {formatMovieLabel(movie)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

      </div>

      {/* <p className="mt-3 text-xs text-[#bacbb6]">
        {selectedMovie
          ? `Seleccionada: ${formatMovieLabel(selectedMovie)}`
          : "La pelicula es obligatoria para publicar el post."}
      </p> */}

      <input type="hidden" name="tmdb_id" value={selectedMovie?.tmdb_id ?? ""} />
      <input type="hidden" name="movie_title" value={selectedMovie?.title ?? ""} />
      <input type="hidden" name="movie_release_date" value={selectedMovie?.release_date ?? ""} />
      <input type="hidden" name="movie_overview" value={selectedMovie?.overview ?? ""} />
    </div>
  );
}
