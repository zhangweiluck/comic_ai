export async function seedTenantWorkflowTaskAndAttempt(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Org', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Workspace',
        'active'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES (
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'image_generation',
        'running',
        '{}'::jsonb
      )
    `,
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        organization_id,
        workspace_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        locked_by,
        locked_until,
        heartbeat_at,
        current_attempt_id,
        input_snapshot_json,
        target_entity_type,
        target_entity_id,
        attempt_count
      )
      VALUES (
        '50000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        'generate_image',
        'running',
        'image-generation',
        'worker-1',
        '2026-05-09T09:58:00.000Z',
        '2026-05-09T09:57:30.000Z',
        '70000000-0000-4000-8000-000000000001',
        '{}'::jsonb,
        'shot',
        '60000000-0000-4000-8000-000000000001',
        1
      )
    `,
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        organization_id,
        workspace_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        locked_by,
        locked_until,
        heartbeat_at,
        started_at
      )
      VALUES (
        '70000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000001',
        1,
        'running',
        'worker-1',
        '2026-05-09T09:58:00.000Z',
        '2026-05-09T09:57:30.000Z',
        '2026-05-09T09:57:00.000Z'
      )
    `,
  );
}
