# Creator Platform Runtime

This repo ships a local creator workspace behind:

```bash
npm run dev:phone-auth
```

The default runtime uses the in-repo dev provider and dev signed-url adapter.

## Runtime switches

Copy `.env.example` to `.env` and change the values you need.

### Provider adapter

- `MODEL_PROVIDER_MODE=dev`
  - Uses the local creator dev provider adapter.
- `MODEL_PROVIDER_MODE=http`
  - Uses the generic HTTP provider adapter.
  - Requires `MODEL_PROVIDER_ENDPOINT`.
  - Supports optional `MODEL_PROVIDER_API_KEY`.
  - Supports optional `MODEL_PROVIDER_NAME` to control the persisted `provider_requests.provider_name`.
- `MODEL_PROVIDER_MODE=openai_images`
  - Uses the OpenAI Images adapter for **image generation only**.
  - Requires `OPENAI_API_KEY`.
  - Supports optional `OPENAI_IMAGE_MODEL`.
  - Video generation continues to use the existing dev/provider fallback path in this phase.

### Storage adapter

- `STORAGE_ADAPTER_MODE=dev`
  - Uses the local dev signed-url adapter.
- `STORAGE_ADAPTER_MODE=public_base_url`
  - Uses the public-base-url storage adapter.
  - Requires `STORAGE_PUBLIC_BASE_URL`.
  - Supports optional `STORAGE_BUCKET` override for created storage objects.

### Creator task/runtime metadata

- `CREATOR_PAYLOAD_SCHEME`
  - Prefix used in provider payload references such as `creator://projects/...`
- `CREATOR_IMAGE_WORKER_ID`
- `CREATOR_VIDEO_WORKER_ID`
- `CREATOR_EXPORT_WORKER_ID`
  - Persisted as `tasks.locked_by` and `task_attempts.locked_by`
- `CREATOR_SIGNED_URL_EXPIRES_SECONDS`
  - Signed read URL TTL in seconds for export preview

## Example: HTTP provider + public CDN URLs

```bash
MODEL_PROVIDER_MODE=http
MODEL_PROVIDER_ENDPOINT=https://provider.example.com
MODEL_PROVIDER_NAME=openai-images
STORAGE_ADAPTER_MODE=public_base_url
STORAGE_PUBLIC_BASE_URL=https://cdn.example.com/assets
STORAGE_BUCKET=creator-prod
CREATOR_PAYLOAD_SCHEME=creator
CREATOR_IMAGE_WORKER_ID=image-http-worker
CREATOR_VIDEO_WORKER_ID=video-http-worker
CREATOR_EXPORT_WORKER_ID=export-http-worker
CREATOR_SIGNED_URL_EXPIRES_SECONDS=1200
```

With that configuration, creator image/video/export flows still use the same B-module orchestration, but the persisted platform records will reflect the configured provider, worker IDs, storage bucket, and signed URL host.
