import type { StorageAdapter } from "./storage.service.ts";

export class PublicBaseUrlStorageAdapter implements StorageAdapter {
  constructor(private readonly baseUrl: string) {}

  async createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }): Promise<{ url: string; expiresAt: Date }> {
    const normalizedBase = this.baseUrl.replace(/\/+$/, "");
    return {
      url: `${normalizedBase}/${encodeURIComponent(input.bucket)}/${encodeURIComponent(input.objectKey)}?expiresAt=${encodeURIComponent(input.expiresAt.toISOString())}`,
      expiresAt: input.expiresAt,
    };
  }
}
