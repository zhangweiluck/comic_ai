-- M0.1 foundation schema draft.
-- Source: docs/architecture/p0-data-schema-draft.md and p0-idempotency-contract.md.

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  phone_e164 text UNIQUE NULL,
  display_name text NULL,
  password_hash text NULL,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  last_login_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'archived')),
  credit_balance_cached integer NOT NULL DEFAULT 0,
  credit_reserved_cached integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner_admin', 'producer', 'creator', 'viewer')),
  status text NOT NULL CHECK (status IN ('active', 'invited', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, workspace_id, user_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id)
);

CREATE INDEX memberships_user_scope_idx
  ON memberships (user_id, organization_id, workspace_id, status);

CREATE TABLE login_challenges (
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  code_hash_version integer NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (
    status IN ('issued', 'consumed', 'expired', 'revoked', 'locked')
  ),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_ip_hash text NULL,
  created_user_agent_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_challenges_phone_status_idx
  ON login_challenges (phone_e164, status, created_at DESC);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  session_token_hash text NOT NULL UNIQUE,
  session_token_hash_version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  cover_image_url text NULL,
  aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('9:16', '16:9')),
  resolution text NOT NULL CHECK (resolution IN ('720p', '1080p')),
  phase text NOT NULL CHECK (phase IN ('script_input', 'asset_review', 'shot_generation', 'export')),
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id)
);

CREATE INDEX projects_workspace_idx
  ON projects (organization_id, workspace_id, created_at DESC);

CREATE TABLE scripts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  status text NOT NULL CHECK (status IN ('draft', 'ready', 'parsed', 'failed')),
  input_text text NOT NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX scripts_project_idx
  ON scripts (organization_id, project_id, created_at DESC);

CREATE TABLE asset_review_candidates (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  candidate_group text NOT NULL CHECK (candidate_group IN ('character', 'scene', 'prop')),
  asset_key text NOT NULL,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, project_id, candidate_group, asset_key),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX asset_review_candidates_project_idx
  ON asset_review_candidates (organization_id, project_id, candidate_group, created_at DESC);

CREATE TABLE assets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  asset_type text NOT NULL CHECK (asset_type IN ('character_sheet', 'scene_reference', 'prop_reference', 'shot_image', 'shot_video')),
  asset_key text NOT NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, project_id, asset_type, asset_key),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX assets_project_idx
  ON assets (organization_id, project_id, asset_type, created_at DESC);

CREATE TABLE asset_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  version_number integer NOT NULL CHECK (version_number >= 1),
  storage_object_key text NOT NULL,
  metadata_json jsonb NOT NULL,
  source_task_id uuid NULL,
  source_attempt_id uuid NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (asset_id, version_number),
  FOREIGN KEY (organization_id, asset_id)
    REFERENCES assets (organization_id, id)
);

CREATE INDEX asset_versions_asset_idx
  ON asset_versions (organization_id, asset_id, version_number DESC);

CREATE TABLE episodes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  title text NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 1),
  status text NOT NULL CHECK (status IN ('draft', 'ready', 'archived')),
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, project_id, sequence),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX episodes_project_idx
  ON episodes (organization_id, project_id, sequence ASC, created_at ASC);

CREATE TABLE storage_objects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  bucket text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (bucket, object_key),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX storage_objects_tenant_idx
  ON storage_objects (organization_id, project_id, created_at DESC);

CREATE TABLE shots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  episode_id uuid NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  content_revision integer NOT NULL DEFAULT 1 CHECK (content_revision >= 1),
  content_status text NOT NULL CHECK (content_status IN ('draft', 'ready', 'stale')),
  image_status text NOT NULL CHECK (image_status IN ('draft', 'ready', 'generating', 'completed', 'failed', 'stale')),
  video_status text NOT NULL CHECK (video_status IN ('not_ready', 'ready', 'generating', 'completed', 'failed', 'stale')),
  current_image_asset_version_id uuid NULL,
  active_image_task_id uuid NULL,
  active_image_revision integer NULL CHECK (active_image_revision >= 1),
  current_video_asset_version_id uuid NULL,
  active_video_task_id uuid NULL,
  active_video_image_asset_version_id uuid NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, episode_id)
    REFERENCES episodes (organization_id, id)
);

CREATE INDEX shots_project_idx
  ON shots (organization_id, project_id, created_at DESC);

CREATE TABLE calibration_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  status text NOT NULL CHECK (status IN ('draft', 'generating', 'ready_for_review', 'passed', 'failed', 'skipped', 'archived')),
  decision_type text NULL CHECK (decision_type IN ('passed', 'skipped', 'override')),
  decision_reason text NULL,
  decided_by_user_id uuid NULL REFERENCES users(id),
  decided_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX calibration_sessions_project_idx
  ON calibration_sessions (organization_id, project_id, created_at DESC);

CREATE TABLE calibration_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  calibration_session_id uuid NOT NULL REFERENCES calibration_sessions(id),
  shot_id uuid NOT NULL REFERENCES shots(id),
  status text NOT NULL CHECK (status IN ('pending', 'generating', 'succeeded', 'failed', 'review_required')),
  quality_review_result text NOT NULL CHECK (quality_review_result IN ('not_checked', 'passed', 'failed', 'review_required')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (calibration_session_id, shot_id),
  FOREIGN KEY (organization_id, calibration_session_id)
    REFERENCES calibration_sessions (organization_id, id),
  FOREIGN KEY (organization_id, shot_id)
    REFERENCES shots (organization_id, id)
);

CREATE INDEX calibration_items_session_idx
  ON calibration_items (organization_id, calibration_session_id);


CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  operation_name text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  resource_scope_type text NULL,
  resource_scope_id uuid NULL,
  response_resource_type text NULL,
  response_resource_id uuid NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (
    status IN (
      'processing',
      'succeeded',
      'failed_retryable',
      'failed_terminal',
      'expired'
    )
  ),
  response_snapshot_json jsonb NULL,
  failure_code text NULL,
  expires_at timestamptz NOT NULL,
  locked_until timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_records_key_unique
    UNIQUE (organization_id, operation_name, idempotency_key),
  CONSTRAINT idempotency_records_resource_scope_pair
    CHECK (
      (resource_scope_type IS NULL AND resource_scope_id IS NULL)
      OR
      (resource_scope_type IS NOT NULL AND resource_scope_id IS NOT NULL)
    ),
  CONSTRAINT idempotency_records_response_pair
    CHECK (
      (response_resource_type IS NULL AND response_resource_id IS NULL)
      OR
      (response_resource_type IS NOT NULL AND response_resource_id IS NOT NULL)
    )
);

CREATE INDEX idempotency_records_expiry_idx
  ON idempotency_records (expires_at)
  WHERE status IN ('succeeded', 'failed_terminal', 'expired');

CREATE INDEX idempotency_records_processing_idx
  ON idempotency_records (organization_id, operation_name, status, locked_until);

CREATE TABLE workflows (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL,
  project_id uuid NULL,
  workflow_type text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'queued',
      'running',
      'partial_succeeded',
      'succeeded',
      'failed',
      'cancel_requested',
      'canceled',
      'result_unknown',
      'manual_review_required'
    )
  ),
  idempotency_record_id uuid NULL REFERENCES idempotency_records(id),
  idempotency_key text NULL,
  input_snapshot_json jsonb NOT NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  failure_code text NULL,
  failure_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX workflows_idempotency_record_idx
  ON workflows (organization_id, idempotency_record_id)
  WHERE idempotency_record_id IS NOT NULL;

CREATE INDEX workflows_status_idx
  ON workflows (organization_id, status, created_at DESC);

CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL,
  project_id uuid NULL,
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  task_type text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancel_requested',
      'canceled',
      'result_unknown',
      'manual_review_required'
    )
  ),
  idempotency_record_id uuid NULL REFERENCES idempotency_records(id),
  idempotency_key text NULL,
  queue_name text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  last_dispatched_at timestamptz NULL,
  locked_by text NULL,
  locked_until timestamptz NULL,
  heartbeat_at timestamptz NULL,
  current_attempt_id uuid NULL,
  input_snapshot_json jsonb NOT NULL,
  target_entity_type text NOT NULL,
  target_entity_id uuid NOT NULL,
  max_attempts integer NOT NULL DEFAULT 1,
  attempt_count integer NOT NULL DEFAULT 0,
  failure_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, workflow_id)
    REFERENCES workflows (organization_id, id)
);

CREATE INDEX tasks_idempotency_record_idx
  ON tasks (organization_id, idempotency_record_id)
  WHERE idempotency_record_id IS NOT NULL;

CREATE INDEX tasks_dispatch_idx ON tasks (status, scheduled_at);
CREATE INDEX tasks_workflow_status_idx ON tasks (organization_id, workflow_id, status);

CREATE TABLE task_attempts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL,
  project_id uuid NULL,
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  status text NOT NULL CHECK (
    status IN (
      'created',
      'running',
      'succeeded',
      'failed',
      'canceled',
      'result_unknown',
      'manual_review_required'
    )
  ),
  locked_by text NULL,
  locked_until timestamptz NULL,
  heartbeat_at timestamptz NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  failure_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (task_id, attempt_number),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, workflow_id)
    REFERENCES workflows (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES tasks (organization_id, id)
);

CREATE INDEX task_attempts_task_status_idx
  ON task_attempts (organization_id, task_id, status);

CREATE TABLE provider_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  workflow_id uuid NULL REFERENCES workflows(id),
  task_id uuid NULL REFERENCES tasks(id),
  attempt_id uuid NULL REFERENCES task_attempts(id),
  provider_name text NOT NULL,
  provider_operation text NOT NULL,
  request_key text NOT NULL,
  request_hash text NOT NULL,
  payload_ref text NOT NULL,
  payload_hash text NOT NULL,
  payload_redacted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (
    status IN (
      'created',
      'submitted',
      'accepted',
      'running',
      'succeeded',
      'failed',
      'canceled',
      'result_unknown',
      'manual_review_required'
    )
  ),
  external_submission_started_at timestamptz NULL,
  external_request_id text NULL,
  response_redacted_json jsonb NULL,
  failure_code text NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CONSTRAINT provider_requests_key_unique
    UNIQUE (organization_id, provider_name, provider_operation, request_key),
  CONSTRAINT provider_requests_external_id_requires_start
    CHECK (
      external_request_id IS NULL
      OR external_submission_started_at IS NOT NULL
    ),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, workflow_id)
    REFERENCES workflows (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES tasks (organization_id, id),
  FOREIGN KEY (organization_id, attempt_id)
    REFERENCES task_attempts (organization_id, id)
);

CREATE INDEX provider_requests_repair_idx
  ON provider_requests (status, external_submission_started_at, updated_at);

CREATE INDEX provider_requests_task_idx
  ON provider_requests (organization_id, task_id, attempt_id)
  WHERE task_id IS NOT NULL;

CREATE TABLE export_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  storage_object_id uuid NOT NULL REFERENCES storage_objects(id),
  manifest_status text NOT NULL CHECK (manifest_status IN ('ready', 'partial')),
  allow_partial_export boolean NOT NULL DEFAULT false,
  item_count integer NOT NULL CHECK (item_count >= 0),
  missing_asset_count integer NOT NULL CHECK (missing_asset_count >= 0),
  latest_signed_url_expires_at timestamptz NOT NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, workflow_id)
    REFERENCES workflows (organization_id, id),
  FOREIGN KEY (organization_id, storage_object_id)
    REFERENCES storage_objects (organization_id, id)
);

CREATE INDEX export_records_project_idx
  ON export_records (organization_id, project_id, created_at DESC);

CREATE TABLE credit_reservations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  workflow_id uuid NULL REFERENCES workflows(id),
  task_id uuid NULL REFERENCES tasks(id),
  amount_total integer NOT NULL CHECK (amount_total > 0),
  amount_reserved integer NOT NULL CHECK (amount_reserved >= 0),
  amount_consumed integer NOT NULL DEFAULT 0 CHECK (amount_consumed >= 0),
  amount_released integer NOT NULL DEFAULT 0 CHECK (amount_released >= 0),
  status text NOT NULL CHECK (
    status IN (
      'active',
      'partially_settled',
      'settled',
      'released',
      'manual_review_required'
    )
  ),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  reason text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CONSTRAINT credit_reservations_source_unique
    UNIQUE (organization_id, source_type, source_id),
  CONSTRAINT credit_reservations_amounts_match
    CHECK (amount_total = amount_reserved + amount_consumed + amount_released),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, workflow_id)
    REFERENCES workflows (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES tasks (organization_id, id)
);

CREATE INDEX credit_reservations_scope_idx
  ON credit_reservations (organization_id, status, created_at DESC);

CREATE TABLE credit_reservation_allocations (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES credit_reservations(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NULL REFERENCES tasks(id),
  attempt_id uuid NULL REFERENCES task_attempts(id),
  provider_request_id uuid NULL REFERENCES provider_requests(id),
  allocation_key text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (
    status IN (
      'reserved',
      'consumed',
      'released',
      'manual_review_required'
    )
  ),
  settled_ledger_entry_id uuid NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CONSTRAINT credit_reservation_allocations_key_unique
    UNIQUE (reservation_id, allocation_key),
  FOREIGN KEY (organization_id, reservation_id)
    REFERENCES credit_reservations (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES tasks (organization_id, id),
  FOREIGN KEY (organization_id, attempt_id)
    REFERENCES task_attempts (organization_id, id),
  FOREIGN KEY (organization_id, provider_request_id)
    REFERENCES provider_requests (organization_id, id)
);

CREATE INDEX credit_reservation_allocations_scope_idx
  ON credit_reservation_allocations (organization_id, status, created_at DESC);

CREATE TABLE credit_ledger_entries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid NULL REFERENCES credit_reservations(id),
  allocation_id uuid NULL REFERENCES credit_reservation_allocations(id),
  entry_type text NOT NULL CHECK (
    entry_type IN ('grant', 'reservation', 'consume', 'release')
  ),
  amount integer NOT NULL CHECK (amount > 0),
  available_delta integer NOT NULL,
  reserved_delta integer NOT NULL,
  consumed_delta integer NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  reason text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CONSTRAINT credit_ledger_entries_source_unique
    UNIQUE (organization_id, source_type, source_id, entry_type),
  CONSTRAINT credit_ledger_entries_delta_shape
    CHECK (
      (
        entry_type = 'grant'
        AND available_delta = amount
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'reservation'
        AND available_delta = -amount
        AND reserved_delta = amount
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'consume'
        AND available_delta = 0
        AND reserved_delta = -amount
        AND consumed_delta = amount
      )
      OR
      (
        entry_type = 'release'
        AND available_delta = amount
        AND reserved_delta = -amount
        AND consumed_delta = 0
      )
    ),
  FOREIGN KEY (organization_id, reservation_id)
    REFERENCES credit_reservations (organization_id, id),
  FOREIGN KEY (organization_id, allocation_id)
    REFERENCES credit_reservation_allocations (organization_id, id)
);

CREATE INDEX credit_ledger_entries_scope_idx
  ON credit_ledger_entries (organization_id, created_at DESC);

CREATE INDEX credit_ledger_entries_reservation_idx
  ON credit_ledger_entries (organization_id, reservation_id, allocation_id)
  WHERE reservation_id IS NOT NULL;

CREATE UNIQUE INDEX credit_ledger_entries_reservation_unique
  ON credit_ledger_entries (organization_id, reservation_id)
  WHERE reservation_id IS NOT NULL AND entry_type = 'reservation';

CREATE UNIQUE INDEX credit_ledger_entries_allocation_settlement_unique
  ON credit_ledger_entries (organization_id, allocation_id)
  WHERE allocation_id IS NOT NULL AND entry_type IN ('consume', 'release');

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  actor_user_id uuid NULL REFERENCES users(id),
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX audit_events_scope_idx
  ON audit_events (organization_id, workspace_id, project_id, created_at DESC);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  organization_id uuid NULL REFERENCES organizations(id),
  event_type text NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inbox_events (
  id uuid PRIMARY KEY,
  consumer_name text NOT NULL,
  outbox_event_id uuid NOT NULL REFERENCES outbox_events(id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consumer_name, outbox_event_id)
);
