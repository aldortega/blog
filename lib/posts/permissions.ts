type ManagePostParams = {
  viewerId: string | null;
  viewerRole: string | null;
  postAuthorId: string;
};

export function isAdminRole(role: string | null): boolean {
  return role === "admin";
}

export function canManagePost({
  viewerId,
  viewerRole,
  postAuthorId,
}: ManagePostParams): boolean {
  if (!viewerId) {
    return false;
  }

  return isAdminRole(viewerRole) || viewerId === postAuthorId;
}
