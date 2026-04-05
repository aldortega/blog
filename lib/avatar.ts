const AVATAR_SIZE_PX = 256;

type UiAvatarOptions = {
  background?: string;
  color?: string;
};

export function normalizeAvatarUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const { hostname } = parsed;
    if (hostname === "lh3.googleusercontent.com") {
      parsed.searchParams.set("sz", String(AVATAR_SIZE_PX));
      return parsed.toString();
    }
    if (hostname === "avatars.githubusercontent.com") {
      parsed.searchParams.set("s", String(AVATAR_SIZE_PX));
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function buildUiAvatarUrl(name: string, options: UiAvatarOptions = {}): string {
  const params = new URLSearchParams({
    name: name.trim() || "U",
    size: String(AVATAR_SIZE_PX),
    format: "png",
    bold: "true",
    rounded: "true",
    background: options.background ?? "random",
  });

  if (options.color) {
    params.set("color", options.color);
  }

  return `https://ui-avatars.com/api/?${params.toString()}`;
}

export function resolveAvatarSrc(
  avatarUrl: string | null | undefined,
  name: string,
  options: UiAvatarOptions = {},
): string {
  if (typeof avatarUrl === "string" && avatarUrl.trim().length > 0) {
    return normalizeAvatarUrl(avatarUrl);
  }

  return buildUiAvatarUrl(name, options);
}
