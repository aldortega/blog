"use client";

import { useEffect, useMemo, useState } from "react";

type MovieSearchResult = {
  tmdb_id: number;
  title: string;
  release_date: string | null;
  overview: string | null;
};

function formatMovieLabel(movie: MovieSearchResult) {
  const year = movie.release_date?.slice(0, 4);
  return year ? `${movie.title} (${year})` : `${movie.title} (----)`;
}

export default function MovieSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

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

  return (
    <div className="bg-[#181c20] rounded-xl p-6 flex flex-col justify-center min-h-[160px]">
      <div className="flex items-center gap-2 mb-4 text-[#40fe6d] text-xs font-bold tracking-widest uppercase">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 3v18" />
          <path d="M3 7.5h4" />
          <path d="M3 12h18" />
          <path d="M3 16.5h4" />
          <path d="M17 3v18" />
          <path d="M17 7.5h4" />
          <path d="M17 16.5h4" />
        </svg>
        <span>Reference Movie</span>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar pelicula (ej: Blade Runner)"
          className="w-full bg-[#0b0f12] rounded-lg border border-[#3c4b3a]/30 px-4 py-3 pr-11 text-sm text-white placeholder:text-[#bacbb6] outline-none focus:border-[#43fe6d] focus:ring-1 focus:ring-[#43fe6d] transition-all font-body"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#bacbb6]"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>

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

      <p className="mt-3 text-xs text-[#bacbb6]">
        {selectedMovie
          ? `Seleccionada: ${formatMovieLabel(selectedMovie)}`
          : "La pelicula es obligatoria para publicar el post."}
      </p>

      <input type="hidden" name="tmdb_id" value={selectedMovie?.tmdb_id ?? ""} />
      <input type="hidden" name="movie_title" value={selectedMovie?.title ?? ""} />
      <input type="hidden" name="movie_release_date" value={selectedMovie?.release_date ?? ""} />
      <input type="hidden" name="movie_overview" value={selectedMovie?.overview ?? ""} />
    </div>
  );
}
