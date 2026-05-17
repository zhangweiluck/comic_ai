import {
  capabilities,
  p0Capabilities,
  type Capability,
} from "../../../../../packages/contracts/domain/capabilities.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { findPersistentAuthSessionByToken } from "../identity/persistent-auth.service.ts";

export type MembershipRole = "owner_admin" | "producer" | "creator" | "viewer";

export interface ActorContext {
  actorId: string;
  organizationId: string;
  workspaceId: string | null;
  role: MembershipRole;
  capabilities: Capability[];
}

interface UserRow {
  id: string;
  status: "active" | "disabled";
}

interface WorkspaceScopeRow {
  workspace_id: string;
  workspace_status: "active" | "archived";
  organization_id: string;
  organization_status: "active" | "suspended" | "archived";
}

interface ProjectScopeRow extends WorkspaceScopeRow {
  project_id: string;
}

interface OrganizationRow {
  id: string;
  status: "active" | "suspended" | "archived";
}

interface MembershipRow {
  role: MembershipRole;
  status: "active" | "invited" | "disabled";
  workspace_id: string | null;
}

export class AuthorizationError extends Error {
  constructor(
    readonly code:
      | "unauthenticated"
      | "user_disabled"
      | "tenant_scope_required"
      | "workspace_not_found"
      | "workspace_not_active"
      | "project_not_found"
      | "organization_not_found"
      | "organization_not_active"
      | "membership_missing"
      | "membership_disabled"
      | "capability_missing",
  ) {
    super(code);
  }
}

const roleCapabilities: Record<MembershipRole, Capability[]> = {
  owner_admin: [...p0Capabilities],
  producer: [
    capabilities.projectCreate,
    capabilities.projectEdit,
    capabilities.generationStart,
    capabilities.exportCreate,
  ],
  creator: [
    capabilities.projectCreate,
    capabilities.projectEdit,
    capabilities.generationStart,
    capabilities.exportCreate,
  ],
  viewer: [],
};

export async function resolveActorContext(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    workspaceId?: string;
    organizationId?: string;
    projectId?: string;
    capability?: Capability;
    now: Date;
  },
): Promise<ActorContext> {
  const session = await findPersistentAuthSessionByToken(db, {
    token: input.sessionToken,
    now: input.now,
  });

  if (!session) {
    throw new AuthorizationError("unauthenticated");
  }

  const user = await queryOne<UserRow>(
    db,
    "SELECT id, status FROM users WHERE id = $1",
    [session.userId],
  );

  if (!user || user.status !== "active") {
    throw new AuthorizationError("user_disabled");
  }

  const scope = await resolveTenantScope(db, input);
  const membership = await findMembership(db, {
    userId: user.id,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
  });

  if (!membership) {
    throw new AuthorizationError("membership_missing");
  }

  if (membership.status !== "active") {
    throw new AuthorizationError("membership_disabled");
  }

  const actor: ActorContext = {
    actorId: user.id,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    role: membership.role,
    capabilities: roleCapabilities[membership.role],
  };

  if (input.capability) {
    assertCapability(actor, input.capability);
  }

  return actor;
}

export function assertCapability(actor: ActorContext, capability: Capability) {
  if (!actor.capabilities.includes(capability)) {
    throw new AuthorizationError("capability_missing");
  }
}

async function resolveTenantScope(
  db: SqlDatabase,
  input: {
    workspaceId?: string;
    organizationId?: string;
    projectId?: string;
  },
): Promise<{ organizationId: string; workspaceId: string | null }> {
  if (input.projectId) {
    const scope = await queryOne<ProjectScopeRow>(
      db,
      `
        SELECT
          projects.id AS project_id,
          workspaces.id AS workspace_id,
          workspaces.status AS workspace_status,
          organizations.id AS organization_id,
          organizations.status AS organization_status
        FROM projects
        JOIN workspaces
          ON workspaces.organization_id = projects.organization_id
         AND workspaces.id = projects.workspace_id
        JOIN organizations ON organizations.id = projects.organization_id
        WHERE projects.id = $1
      `,
      [input.projectId],
    );

    if (!scope) {
      throw new AuthorizationError("project_not_found");
    }

    if (scope.organization_status !== "active") {
      throw new AuthorizationError("organization_not_active");
    }

    if (scope.workspace_status !== "active") {
      throw new AuthorizationError("workspace_not_active");
    }

    return {
      organizationId: scope.organization_id,
      workspaceId: scope.workspace_id,
    };
  }

  if (input.workspaceId) {
    const scope = await queryOne<WorkspaceScopeRow>(
      db,
      `
        SELECT
          workspaces.id AS workspace_id,
          workspaces.status AS workspace_status,
          organizations.id AS organization_id,
          organizations.status AS organization_status
        FROM workspaces
        JOIN organizations ON organizations.id = workspaces.organization_id
        WHERE workspaces.id = $1
      `,
      [input.workspaceId],
    );

    if (!scope) {
      throw new AuthorizationError("workspace_not_found");
    }

    if (scope.organization_status !== "active") {
      throw new AuthorizationError("organization_not_active");
    }

    if (scope.workspace_status !== "active") {
      throw new AuthorizationError("workspace_not_active");
    }

    return {
      organizationId: scope.organization_id,
      workspaceId: scope.workspace_id,
    };
  }

  if (input.organizationId) {
    const organization = await queryOne<OrganizationRow>(
      db,
      "SELECT id, status FROM organizations WHERE id = $1",
      [input.organizationId],
    );

    if (!organization) {
      throw new AuthorizationError("organization_not_found");
    }

    if (organization.status !== "active") {
      throw new AuthorizationError("organization_not_active");
    }

    return {
      organizationId: organization.id,
      workspaceId: null,
    };
  }

  throw new AuthorizationError("tenant_scope_required");
}

async function findMembership(
  db: SqlDatabase,
  input: {
    userId: string;
    organizationId: string;
    workspaceId: string | null;
  },
) {
  return queryOne<MembershipRow>(
    db,
    `
      SELECT role, status, workspace_id
      FROM memberships
      WHERE organization_id = $1
        AND user_id = $2
        AND (
          workspace_id = $3
          OR workspace_id IS NULL
        )
      ORDER BY workspace_id NULLS LAST
      LIMIT 1
    `,
    [input.organizationId, input.userId, input.workspaceId],
  );
}
