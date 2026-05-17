export class TenantScopeError extends Error {
  constructor(
    readonly code: "organization_scope_required" | "project_scope_required",
  ) {
    super(code);
  }
}

export function assertTenantScope(input: { organizationId?: string | null }) {
  if (!input.organizationId) {
    throw new TenantScopeError("organization_scope_required");
  }
}

export function assertProjectTenantScope(input: {
  organizationId?: string | null;
  projectId?: string | null;
}) {
  assertTenantScope(input);

  if (!input.projectId) {
    throw new TenantScopeError("project_scope_required");
  }
}
