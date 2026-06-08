// Armado del árbol de respuestas del foro a partir de filas planas (parent_id).
//
// Decisión (sesión de grilling): cargamos TODAS las respuestas del hilo y armamos
// el árbol en memoria; los hermanos van best-first (score desc, desempate por fecha
// asc). La profundidad real se conserva en `depth`; el tope visual de indentado y
// el aplanado ("En respuesta a @usuario") son responsabilidad del render.

export type ForumReplyBase = {
  id: string;
  parent_id: string | null;
  score: number;
  created_at: string;
};

export type ForumReplyNode<T extends ForumReplyBase> = T & {
  depth: number;
  children: ForumReplyNode<T>[];
};

function sortSiblings<T extends ForumReplyBase>(a: ForumReplyNode<T>, b: ForumReplyNode<T>): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/**
 * Convierte filas planas de forum_posts en un bosque (top-level + hijos anidados).
 * Las filas huérfanas (parent inexistente) se tratan como top-level para no perderlas.
 */
export function buildReplyTree<T extends ForumReplyBase>(rows: T[]): ForumReplyNode<T>[] {
  const nodeById = new Map<string, ForumReplyNode<T>>();
  for (const row of rows) {
    nodeById.set(row.id, { ...row, depth: 0, children: [] });
  }

  const roots: ForumReplyNode<T>[] = [];
  for (const node of nodeById.values()) {
    const parent = node.parent_id ? nodeById.get(node.parent_id) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Asigna profundidad y ordena hermanos recursivamente.
  const assign = (nodes: ForumReplyNode<T>[], depth: number) => {
    nodes.sort(sortSiblings);
    for (const node of nodes) {
      node.depth = depth;
      assign(node.children, depth + 1);
    }
  };
  assign(roots, 0);

  return roots;
}

/** Aplana el bosque a una lista en orden de render (preorden DFS). */
export function flattenReplyTree<T extends ForumReplyBase>(
  roots: ForumReplyNode<T>[],
): ForumReplyNode<T>[] {
  const out: ForumReplyNode<T>[] = [];
  const walk = (node: ForumReplyNode<T>) => {
    out.push(node);
    for (const child of node.children) {
      walk(child);
    }
  };
  for (const root of roots) {
    walk(root);
  }
  return out;
}
