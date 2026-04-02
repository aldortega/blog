import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

type MarkdownRendererProps = {
  content: string;
  className?: string;
  compact?: boolean;
};

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
          p: ({ children }) => <p className="my-4 text-[#d8dde5]">{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className="my-5 border-l-4 border-[#40fe6d]/70 bg-[#0f1518] px-4 py-3 italic text-[#bacbb6]">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6 marker:text-[#40fe6d]">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-4 list-decimal space-y-2 pl-6 marker:text-[#40fe6d]">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
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
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src ?? ""}
              alt={alt ?? "Imagen del contenido"}
              loading="lazy"
              className="my-6 w-full rounded-xl border border-[#3c4b3a]/30 object-cover"
            />
          ),
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
