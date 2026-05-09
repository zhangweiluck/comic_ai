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

CREATE TABLE login_challenges (
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
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
  session_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
  updated_at timestamptz NOT NULL DEFAULT now()
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_idempotency_record_idx
  ON tasks (organization_id, idempotency_record_id)
  WHERE idempotency_record_id IS NOT NULL;

CREATE INDEX tasks_dispatch_idx ON tasks (status, scheduled_at);
CREATE INDEX tasks_workflow_status_idx ON tasks (organization_id, workflow_id, status);

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
