import type { StorageAdapter } from "./storage.service.ts";
import { CreatorDevStorageAdapter } from "./creator-dev.storage-adapter.ts";
import { PublicBaseUrlStorageAdapter } from "./public-base-url.storage-adapter.ts";

export function createStorageAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StorageAdapter {
  const mode = env.STORAGE_ADAPTER_MODE ?? "dev";

  if (mode === "public_base_url") {
    const baseUrl = env.STORAGE_PUBLIC_BASE_URL?.trim();
    if (!baseUrl) {
      throw new Error("storage_public_base_url_required");
    }

    return new PublicBaseUrlStorageAdapter(baseUrl);
  }

  return new CreatorDevStorageAdapter();
}
