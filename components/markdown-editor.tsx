"use client";

import { useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bold,
  Heading,
  ImagePlus,
  Italic,
  ListChecks,
  ListOrdered,
  Link2,
  List,
  Quote,
  Table,
} from "lucide-react";

const MarkdownRenderer = dynamic(() => import("@/components/markdown-renderer"));

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

type MarkdownEditorProps = {
  name?: string;
  initialValue?: string;
  placeholder?: string;
  required?: boolean;
};

export default function MarkdownEditor({
  name = "content",
  initialValue = "",
  placeholder = "Escribe tu analisis...",
  required = false,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [markdown, setMarkdown] = useState(initialValue);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function focusTextarea() {
    textareaRef.current?.focus();
  }

  function replaceSelection(
    replacer: (selected: string) => { replacement: string; cursorStart: number; cursorEnd: number },
  ) {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = markdown.slice(start, end);
    const { replacement, cursorStart, cursorEnd } = replacer(selected);
    const nextValue = markdown.slice(0, start) + replacement + markdown.slice(end);

    setMarkdown(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + cursorStart, start + cursorEnd);
    });
  }

  function insertAtCursor(text: string) {
    replaceSelection((selected) => {
      if (selected.length > 0) {
        const replacement = text.replace("$SELECTION$", selected);
        return {
          replacement,
          cursorStart: replacement.length,
          cursorEnd: replacement.length,
        };
      }
      const replacement = text.replace("$SELECTION$", "");
      return {
        replacement,
        cursorStart: replacement.length,
        cursorEnd: replacement.length,
      };
    });
  }

  function insertWrap(prefix: string, suffix: string, placeholder = "") {
    replaceSelection((selected) => {
      if (selected.length > 0) {
        const replacement = `${prefix}${selected}${suffix}`;
        const cursor = prefix.length + selected.length;
        return { replacement, cursorStart: cursor, cursorEnd: cursor };
      }

      const replacement = `${prefix}${placeholder}${suffix}`;
      const cursorStart = prefix.length;
      const cursorEnd = prefix.length + placeholder.length;
      return { replacement, cursorStart, cursorEnd };
    });
  }

  function insertLinePrefix(prefix: string) {
    replaceSelection((selected) => {
      if (selected.length > 0) {
        const replacement = selected
          .split("\n")
          .map((line) => `${prefix}${line}`)
          .join("\n");
        return {
          replacement,
          cursorStart: replacement.length,
          cursorEnd: replacement.length,
        };
      }

      return {
        replacement: prefix,
        cursorStart: prefix.length,
        cursorEnd: prefix.length,
      };
    });
  }

  async function handleImagePicked(file: File) {
    setUploadError(null);
    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/posts/content-image", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !payload.url) {
        setUploadError(payload.error ?? "No se pudo subir la imagen.");
        return;
      }

      const rawAlt = window.prompt("Texto alternativo de la imagen (opcional):", "") ?? "";
      const alt = rawAlt.trim() || "imagen";
      const syntax = `\n![${alt}](${payload.url})\n`;
      insertAtCursor(syntax.replace("$SELECTION$", ""));
      setMode("edit");
      focusTextarea();
    } catch {
      setUploadError("No se pudo subir la imagen. Intenta nuevamente.");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <div className="bg-[#181c20] rounded-xl overflow-hidden min-h-[600px] flex flex-col">
      <input type="hidden" name={name} value={markdown} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3c4b3a]/20 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3 text-[#e0e3e8]">
          <button
            type="button"
            onClick={() => insertWrap("**", "**")}
            aria-label="Negrita"
            title="Negrita"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            onClick={() => insertWrap("*", "*")}
            aria-label="Cursiva"
            title="Cursiva"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("## ")}
            aria-label="Encabezado"
            title="Encabezado"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <Heading size={16} />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("> ")}
            aria-label="Cita"
            title="Cita"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <Quote size={16} />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("- ")}
            aria-label="Lista"
            title="Lista"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("1. ")}
            aria-label="Lista ordenada"
            title="Lista ordenada"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <ListOrdered size={16} />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix("- [ ] ")}
            aria-label="Lista de tareas"
            title="Lista de tareas"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <ListChecks size={16} />
          </button>
          <button
            type="button"
            onClick={() => insertWrap("[", "](https://)", "texto")}
            aria-label="Enlace"
            title="Enlace"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <Link2 size={16} />
          </button>
          <button
            type="button"
            onClick={() =>
              insertAtCursor("\n| Columna 1 | Columna 2 |\n| --- | --- |\n| Valor 1 | Valor 2 |\n")
            }
            aria-label="Tabla"
            title="Tabla"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d]"
          >
            <Table size={16} />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            aria-label="Imagen"
            title="Imagen"
            className="rounded border border-[#3c4b3a]/40 p-2 transition-colors hover:border-[#40fe6d] hover:text-[#40fe6d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadingImage ? <span className="text-xs">...</span> : <ImagePlus size={16} />}
          </button>
          <input
            id={inputId}
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void handleImagePicked(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>

        <div className="inline-flex rounded-lg border border-[#3c4b3a]/40 p-1">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`rounded px-3 py-1 text-xs font-bold tracking-wide transition-colors ${mode === "edit" ? "bg-[#40fe6d] text-[#00390f]" : "text-[#bacbb6] hover:text-white"
              }`}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`rounded px-3 py-1 text-xs font-bold tracking-wide transition-colors ${mode === "preview" ? "bg-[#40fe6d] text-[#00390f]" : "text-[#bacbb6] hover:text-white"
              }`}
          >
            Vista previa
          </button>
        </div>
      </div>

      {uploadError ? (
        <p className="border-b border-rose-900/30 bg-rose-950/30 px-6 py-2 text-xs text-rose-300">{uploadError}</p>
      ) : null}

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={markdown}
          required={required}
          onChange={(event) => setMarkdown(event.currentTarget.value)}
          placeholder={placeholder}
          className="min-h-[340px] flex-1 resize-none bg-transparent p-6 text-base leading-relaxed text-[#e0e3e8] outline-none placeholder:text-[#bacbb6]/50 font-body"
        />
      ) : (
        <div className="min-h-[340px] flex-1 overflow-y-auto p-6">
          {markdown.trim() ? (
            <MarkdownRenderer content={markdown} compact />
          ) : (
            <p className="text-sm text-[#bacbb6]/70">Todavia no hay contenido para previsualizar.</p>
          )}
        </div>
      )}
    </div>
  );
}
