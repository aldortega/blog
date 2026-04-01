export type RelationOneOrMany<T> = T | T[] | null;

export function relationFirst<T>(relation: RelationOneOrMany<T>): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export function relationText<T>(
  relation: RelationOneOrMany<T>,
  pick: (item: T) => string | null | undefined,
  fallback: string,
): string {
  const item = relationFirst(relation);
  if (!item) return fallback;

  const value = pick(item);
  return value?.trim() ? value : fallback;
}
