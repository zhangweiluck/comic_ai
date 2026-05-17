import { randomUUID } from "node:crypto";

import {
  AuthorizationError,
  resolveActorContext,
} from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface StorageObjectRecord {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  bucket: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number | null;
  checksum: string | null;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface StorageAdapter {
  createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }): Promise<{ url: string; expiresAt: Date }>;
}

interface StorageObjectRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  project_id: string | null;
  bucket: string;
  object_key: string;
  content_type: string;
  size_bytes: number | string | null;
  checksum: string | null;
  metadata_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date;
}

interface ProjectScopeRow {
  organization_id: string;
  workspace_id: string;
}

interface WorkspaceScopeRow {
  organization_id: string;
}

interface OrganizationRow {
  id: string;
}

export class StorageAccessError extends Error {
  constructor(
    readonly code:
      | "invalid_storage_scope"
      | "invalid_object_name"
      | "storage_object_not_found",
  ) {
    super(code);
  }
}

export async function createScopedStorageObject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId?: string | null;
    projectId?: string | null;
    bucket: string;
    objectName: string;
    contentType: string;
    sizeBytes?: number | null;
    checksum?: string | null;
    metadata?: Record<string, unknown>;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<StorageObjectRecord> {
  await assertStorageScope(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
  });

  const objectId = randomUUID();
  const objectKey = buildScopedObjectKey({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
    objectId,
    objectName: input.objectName,
  });

  const row = await queryOne<StorageObjectRow>(
    db,
    `
      INSERT INTO storage_objects (
        id,
        organization_id,
        workspace_id,
        project_id,
        bucket,
        object_key,
        content_type,
        size_bytes,
        checksum,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
      RETURNING *
    `,
    [
      objectId,
      input.organizationId,
      input.workspaceId ?? null,
      input.projectId ?? null,
      input.bucket,
      objectKey,
      input.contentType,
      input.sizeBytes ?? null,
      input.checksum ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.createdByUserId ?? null,
      input.now,
    ],
  );

  return storageObjectFromRow(row!);
}

export async function createSignedReadUrl(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    storageObjectId: string;
    adapter: StorageAdapter;
    now: Date;
    expiresInSeconds: number;
  },
): Promise<{
  url: string;
  expiresAt: Date;
  object: StorageObjectRecord;
}> {
  const object = await findStorageObject(db, input.storageObjectId);
  if (!object) {
    throw new StorageAccessError("storage_object_not_found");
  }

  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    organizationId: object.workspaceId ? undefined : object.organizationId,
    workspaceId: object.workspaceId ?? undefined,
    now: input.now,
  });

  if (actor.organizationId !== object.organizationId) {
    throw new AuthorizationError("membership_missing");
  }

  const expiresAt = new Date(input.now.getTime() + input.expiresInSeconds * 1000);
  const signed = await input.adapter.createSignedReadUrl({
    bucket: object.bucket,
    objectKey: object.objectKey,
    expiresAt,
  });

  return {
    ...signed,
    object,
  };
}

async function findStorageObject(
  db: SqlDatabase,
  storageObjectId: string,
): Promise<StorageObjectRecord | undefined> {
  const row = await queryOne<StorageObjectRow>(
    db,
    "SELECT * FROM storage_objects WHERE id = $1",
    [storageObjectId],
  );

  return row ? storageObjectFromRow(row) : undefined;
}

async function assertStorageScope(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
  },
) {
  if (input.projectId) {
    const project = await queryOne<ProjectScopeRow>(
      db,
      "SELECT organization_id, workspace_id FROM projects WHERE id = $1",
      [input.projectId],
    );

    if (
      !project ||
      project.organization_id !== input.organizationId ||
      project.workspace_id !== input.workspaceId
    ) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    return;
  }

  if (input.workspaceId) {
    const workspace = await queryOne<WorkspaceScopeRow>(
      db,
      "SELECT organization_id FROM workspaces WHERE id = $1",
      [input.workspaceId],
    );

    if (!workspace || workspace.organization_id !== input.organizationId) {
      throw new StorageAccessError("invalid_storage_scope");
    }
    return;
  }

  const organization = await queryOne<OrganizationRow>(
    db,
    "SELECT id FROM organizations WHERE id = $1",
    [input.organizationId],
  );

  if (!organization) {
    throw new StorageAccessError("invalid_storage_scope");
  }
}

function buildScopedObjectKey(input: {
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  objectId: string;
  objectName: string;
}) {
  const safeName = sanitizeObjectName(input.objectName);

  return [
    "organizations",
    input.organizationId,
    "workspaces",
    input.workspaceId ?? "_",
    "projects",
    input.projectId ?? "_",
    input.objectId,
    safeName,
  ].join("/");
}

function sanitizeObjectName(objectName: string) {
  const basename = objectName.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const safeName = basename.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  if (!safeName || /^https?:/i.test(objectName)) {
    throw new StorageAccessError("invalid_object_name");
  }

  return safeName;
}

function storageObjectFromRow(row: StorageObjectRow): StorageObjectRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    bucket: row.bucket,
    objectKey: row.object_key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    checksum: row.checksum,
    metadata: row.metadata_json,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
