import type { ProviderAdapter } from "../model-gateway/provider-adapter.contract.ts";
import { createProviderAdapterFromEnv } from "../model-gateway/provider-adapter.factory.ts";
import type { StorageAdapter } from "../storage/storage.service.ts";
import { createStorageAdapterFromEnv } from "../storage/storage-adapter.factory.ts";

export interface CreatorPlatformRuntime {
  providerAdapter: ProviderAdapter;
  storageAdapter: StorageAdapter;
  providerName: string;
  storageBucket: string;
  payloadRefScheme: string;
  imageWorkerId: string;
  videoWorkerId: string;
  exportWorkerId: string;
  signedUrlExpiresInSeconds: number;
}

export function createCreatorPlatformRuntime(
  env: NodeJS.ProcessEnv = process.env,
  input: {
    fetchImpl?: typeof fetch;
    generationKind?: "image" | "video" | "export";
  } = {},
): CreatorPlatformRuntime {
  const requestedProviderMode = normalize(env.MODEL_PROVIDER_MODE) ?? "dev";
  const providerMode =
    input.generationKind === "video" && requestedProviderMode === "openai_images"
      ? "dev"
      : requestedProviderMode;
  const storageMode = normalize(env.STORAGE_ADAPTER_MODE) ?? "dev";
  const providerEnv =
    providerMode === requestedProviderMode
      ? env
      : {
          ...env,
          MODEL_PROVIDER_MODE: providerMode,
        };

  return {
    providerAdapter: createProviderAdapterFromEnv(providerEnv, input.fetchImpl),
    storageAdapter: createStorageAdapterFromEnv(env),
    providerName:
      providerMode === requestedProviderMode
        ? normalize(env.MODEL_PROVIDER_NAME) ?? defaultProviderName(providerMode)
        : defaultProviderName(providerMode),
    storageBucket: normalize(env.STORAGE_BUCKET) ?? defaultStorageBucket(storageMode),
    payloadRefScheme: normalize(env.CREATOR_PAYLOAD_SCHEME) ?? "creator",
    imageWorkerId: normalize(env.CREATOR_IMAGE_WORKER_ID) ?? "creator-image-worker",
    videoWorkerId: normalize(env.CREATOR_VIDEO_WORKER_ID) ?? "creator-video-worker",
    exportWorkerId: normalize(env.CREATOR_EXPORT_WORKER_ID) ?? "creator-export-worker",
    signedUrlExpiresInSeconds: parsePositiveInteger(
      env.CREATOR_SIGNED_URL_EXPIRES_SECONDS,
      900,
    ),
  };
}

function normalize(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultProviderName(mode: string) {
  if (mode === "openai_images") {
    return "openai-images";
  }

  return mode === "dev" ? "creator-dev" : `creator-${mode}`;
}

function defaultStorageBucket(mode: string) {
  return mode === "dev" ? "creator-dev" : `creator-${mode}`;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
