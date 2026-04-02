"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";

type PostImageUploadProps = {
  name?: string;
  required?: boolean;
  accept?: string;
  emptyLabel: string;
  initialImageUrl?: string | null;
};

export default function PostImageUpload({
  name = "image",
  required = false,
  accept = "image/jpeg,image/png,image/webp",
  emptyLabel,
  initialImageUrl = null,
}: PostImageUploadProps) {
  const inputId = useId();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const previewUrl = useMemo(() => localPreviewUrl ?? initialImageUrl ?? null, [localPreviewUrl, initialImageUrl]);

  return (
    <div className="bg-[#181c20] rounded-xl p-6 min-h-[160px] relative overflow-hidden group">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(64,254,109,0.05)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="flex items-center gap-2 mb-4 text-[#40fe6d] text-xs font-bold tracking-widest uppercase relative z-10">
        <ImageIcon className="h-4 w-4" />
        <span>Imagen de portada</span>
      </div>

      <div className="relative z-10 w-full h-full">
        <input
          id={inputId}
          name={name}
          type="file"
          required={required}
          accept={accept}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setSelectedFileName(file?.name ?? null);

            setLocalPreviewUrl((currentPreview) => {
              if (currentPreview) {
                URL.revokeObjectURL(currentPreview);
              }
              return file ? URL.createObjectURL(file) : null;
            });
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        />
        <label
          htmlFor={inputId}
          className="border border-dashed border-[#3c4b3a]/50 rounded-lg p-3 flex flex-col items-center justify-center gap-3 bg-[#0b0f12]/50 group-hover:bg-[#0b0f12]/80 group-hover:border-[#40fe6d]/50 transition-colors min-h-[170px]"
        >
          {previewUrl ? (
            <div className="relative h-full min-h-[150px] w-full overflow-hidden rounded-md border border-[#3c4b3a]/35">
              <div
                className="absolute inset-0 bg-center bg-cover"
                style={{ backgroundImage: `url("${previewUrl}")` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f12]/85 via-[#0b0f12]/30 to-transparent" />
              <span className="absolute bottom-3 left-3 right-3 truncate text-[10px] font-bold tracking-widest uppercase text-[#e0e3e8]">
                {selectedFileName ?? "Portada actual"}
              </span>
            </div>
          ) : (
            <>
              <ImageIcon className="h-6 w-6 text-[#bacbb6]" />
              <span className="max-w-full truncate text-xs font-bold tracking-widest uppercase text-[#bacbb6]">
                {selectedFileName ?? emptyLabel}
              </span>
            </>
          )}
        </label>
      </div>
    </div>
  );
}
