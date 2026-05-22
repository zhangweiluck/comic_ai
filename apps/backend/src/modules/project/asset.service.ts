import { randomUUID } from "node:crypto";

export type AssetType =
  | "character_sheet"
  | "scene_reference"
  | "prop_reference"
  | "shot_image"
  | "shot_video";

export interface AssetRecord {
  id: string;
  organizationId: string;
  projectId: string;
  assetType: AssetType;
  assetKey: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetVersionRecord {
  id: string;
  organizationId: string;
  assetId: string;
  versionNumber: number;
  storageObjectKey: string;
  metadata: {
    mimeType: string;
    width: number;
    height: number;
    [key: string]: unknown;
  };
  sourceTaskId: string;
  sourceAttemptId: string;
  createdByUserId: string;
  createdAt: Date;
}

export class AssetValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("asset_version_validation_failed");
  }
}

export class InMemoryAssetStore {
  private readonly assetsById = new Map<string, AssetRecord>();
  private readonly versionsByAssetId = new Map<string, AssetVersionRecord[]>();
  private readonly assetIdByNaturalKey = new Map<string, string>();

  async findOrCreateAsset(input: {
    organizationId: string;
    projectId: string;
    assetType: AssetType;
    assetKey: string;
    createdByUserId: string;
  }): Promise<AssetRecord> {
    const now = new Date();
    const naturalKey = buildAssetNaturalKey(input);
    const existingId = this.assetIdByNaturalKey.get(naturalKey);
    if (existingId) {
      const existing = this.assetsById.get(existingId);
      if (!existing) {
        throw new Error("asset_missing_for_natural_key");
      }
      return existing;
    }

    const asset: AssetRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      assetType: input.assetType,
      assetKey: input.assetKey,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };

    this.assetsById.set(asset.id, asset);
    this.assetIdByNaturalKey.set(naturalKey, asset.id);
    this.versionsByAssetId.set(asset.id, []);
    return asset;
  }

  async appendAssetVersion(input: Omit<AssetVersionRecord, "id" | "createdAt">): Promise<AssetVersionRecord> {
    const version: AssetVersionRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
    };

    const versions = this.versionsByAssetId.get(input.assetId) ?? [];
    versions.push(version);
    this.versionsByAssetId.set(input.assetId, versions);
    return version;
  }

  async listAssetVersions(assetId: string): Promise<AssetVersionRecord[]> {
    return [...(this.versionsByAssetId.get(assetId) ?? [])];
  }
}

export async function createAssetVersion(
  store: InMemoryAssetStore,
  input: {
    organizationId: string;
    projectId: string;
    assetType: AssetType;
    assetKey: string;
    createdByUserId: string;
    storageObjectKey: string;
    metadata: {
      mimeType: string;
      width: number;
      height: number;
      [key: string]: unknown;
    };
    sourceTaskId: string;
    sourceAttemptId: string;
  },
) {
  const fieldErrors = validateAssetVersionInput(input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new AssetValidationError(fieldErrors);
  }

  const asset = await store.findOrCreateAsset({
    organizationId: input.organizationId,
    projectId: input.projectId,
    assetType: input.assetType,
    assetKey: input.assetKey.trim(),
    createdByUserId: input.createdByUserId,
  });

  const existingVersions = await store.listAssetVersions(asset.id);
  const version = await store.appendAssetVersion({
    organizationId: input.organizationId,
    assetId: asset.id,
    versionNumber: existingVersions.length + 1,
    storageObjectKey: input.storageObjectKey.trim(),
    metadata: {
      mimeType: input.metadata.mimeType.trim(),
      width: input.metadata.width,
      height: input.metadata.height,
    },
    sourceTaskId: input.sourceTaskId,
    sourceAttemptId: input.sourceAttemptId,
    createdByUserId: input.createdByUserId,
  });

  return { asset, version };
}

function validateAssetVersionInput(input: {
  assetKey: string;
  storageObjectKey: string;
  metadata: { mimeType: string; width: number; height: number };
}) {
  const fieldErrors: Record<string, string> = {};

  if (input.assetKey.trim().length < 1) {
    fieldErrors.assetKey = "asset_key_required";
  }

  if (input.storageObjectKey.trim().length < 1) {
    fieldErrors.storageObjectKey = "storage_object_key_required";
  }

  if (input.metadata.mimeType.trim().length < 1) {
    fieldErrors.mimeType = "metadata_required";
  }

  if (input.metadata.width < 1) {
    fieldErrors.width = "metadata_required";
  }

  if (input.metadata.height < 1) {
    fieldErrors.height = "metadata_required";
  }

  return fieldErrors;
}

function buildAssetNaturalKey(input: {
  organizationId: string;
  projectId: string;
  assetType: AssetType;
  assetKey: string;
}) {
  return [input.organizationId, input.projectId, input.assetType, input.assetKey].join(":");
}
