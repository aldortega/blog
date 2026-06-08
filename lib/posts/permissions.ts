export function isAdminRole(role: string | null): boolean {
  return role === "admin";
}

// Crear/editar/borrar contenido (posts, categorías) es exclusivo de admins.
// Refleja la RLS: solo role='admin' puede escribir en posts/categories.
export function canManageContent(role: string | null): boolean {
  return isAdminRole(role);
}
