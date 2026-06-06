import Image from "next/image";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/* eslint-disable @next/next/no-img-element */

type MarkdownRendererProps = {
  content: string;
  className?: string;
  compact?: boolean;
};

// Extrae el id de video de las formas comunes de URL de YouTube. Solo aceptamos
// hosts oficiales para no abrir el iframe a cualquier dominio.
function extractYouTubeId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const isValidId = (id: string | null | undefined): id is string =>
    typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id);

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return isValidId(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      return isValidId(id) ? id : null;
    }
    const match = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/);
    if (match) {
      return isValidId(match[1]) ? match[1] : null;
    }
  }

  return null;
}

// Si el párrafo es únicamente una URL de YouTube (texto plano autolinkeado por
// remark-gfm o un link explícito), devolvemos el id para renderizar el embed en
// lugar del <p>. Así evitamos habilitar iframes arbitrarios en rehype-sanitize.
function youTubeIdFromParagraph(node: ExtraProps["node"]): string | null {
  if (!node || !("children" in node)) {
    return null;
  }

  const children = node.children.filter(
    (child) => !(child.type === "text" && child.value.trim() === ""),
  );
  if (children.length !== 1) {
    return null;
  }

  const [only] = children;

  if (only.type === "text") {
    return extractYouTubeId(only.value);
  }

  if (only.type === "element" && only.tagName === "a") {
    const href = only.properties?.href;
    return typeof href === "string" ? extractYouTubeId(href) : null;
  }

  return null;
}

function YouTubeEmbed({ id }: { id: string }) {
  return (
    <div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-[#3c4b3a]/30 bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title="Video de YouTube"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}

const STATIC_IMAGE_HOSTS = new Set([
  "lh3.googleusercontent.com",
  "ui-avatars.com",
]);

function isSafeHttpUrl(src: string): boolean {
  return /^https?:\/\//.test(src);
}

function resolveSupabaseStorageHost(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return null;
  }

  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
}

function shouldUseNextImage(src: string): boolean {
  if (src.startsWith("/")) {
    return true;
  }

  if (!isSafeHttpUrl(src)) {
    return false;
  }

  try {
    const { hostname } = new URL(src);
    const supabaseHost = resolveSupabaseStorageHost();
    return STATIC_IMAGE_HOSTS.has(hostname) || hostname === supabaseHost;
  } catch {
    return false;
  }
}

export default function MarkdownRenderer({
  content,
  className = "",
  compact = false,
}: MarkdownRendererProps) {
  const baseClass = compact ? "text-sm leading-relaxed" : "text-lg leading-relaxed";

  return (
    <div className={`${baseClass} text-[#e0e3e8] font-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-8 mb-4 text-3xl font-bold tracking-tight text-white">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-8 mb-4 text-2xl font-bold tracking-tight text-white">{children}</h2>
          ),
          h3: ({ children }) => <h3 className="mt-6 mb-3 text-xl font-bold text-white">{children}</h3>,
          p: ({ node, children }) => {
            const youTubeId = youTubeIdFromParagraph(node);
            if (youTubeId) {
              return <YouTubeEmbed id={youTubeId} />;
            }
            return <p className="my-4 text-[#d8dde5]">{children}</p>;
          },
          blockquote: ({ children }) => (
            <blockquote className="my-5 border-l-4 border-[#40fe6d]/70 bg-[#0f1518] px-4 py-3 italic text-[#bacbb6]">
              {children}
            </blockquote>
          ),
          ul: ({ node, children, ...props }) => {
            void node;
            return (
              <ul {...props} className="my-4 list-disc space-y-2 pl-8 marker:text-[#40fe6d]">
                {children}
              </ul>
            );
          },
          ol: ({ node, children, ...props }) => {
            void node;
            return (
              <ol {...props} className="my-4 list-decimal space-y-2 pl-6 marker:text-[#40fe6d]">
                {children}
              </ol>
            );
          },
          li: ({ node, children, ...props }) => {
            void node;
            return <li {...props}>{children}</li>;
          },
          a: ({ href, children }) => {
            const isExternal = typeof href === "string" && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="underline decoration-[#40fe6d]/60 decoration-2 underline-offset-4 transition-colors hover:text-[#40fe6d]"
              >
                {children}
              </a>
            );
          },
          hr: () => <hr className="my-8 border-[#3c4b3a]/40" />,
          img: ({ src, alt, width, height }) => {
            const imageSrc = typeof src === "string" ? src : "";
            const imageAlt = alt ?? "Imagen del contenido";
            const parsedWidth = Number(width);
            const parsedHeight = Number(height);
            const safeWidth = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1200;
            const safeHeight = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 675;

            if (shouldUseNextImage(imageSrc)) {
              return (
                <Image
                  src={imageSrc}
                  alt={imageAlt}
                  width={safeWidth}
                  height={safeHeight}
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, 900px"
                  className="my-6 h-auto w-full rounded-xl border border-[#3c4b3a]/30 object-cover"
                />
              );
            }

            // Fallback for arbitrary markdown hosts not whitelisted in next/image config.
            return (
              <img
                src={imageSrc}
                alt={imageAlt}
                loading="lazy"
                className="my-6 w-full rounded-xl border border-[#3c4b3a]/30 object-cover"
              />
            );
          },
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#1f262b]">{children}</thead>,
          th: ({ children }) => <th className="border border-[#3c4b3a]/40 px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-[#3c4b3a]/30 px-3 py-2 text-[#d8dde5]">{children}</td>,
          code: ({ children }) => (
            <code className="rounded bg-[#0f1518] px-1.5 py-0.5 text-[0.9em] text-[#b6ffc8]">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
