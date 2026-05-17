import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../packages/contracts/domain/operation-names.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import { createParseScriptWorkflowRequest } from "../parse-script.service.ts";
import { createProjectDraft } from "../project.service.ts";
import { SqlProjectStore } from "../sql-project.store.ts";

describe("SQL project store", { concurrency: false }, () => {
  it("persists create project, script, and idempotency replay state", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const store = new SqlProjectStore(db);

      const first = await createProjectDraft(store, createInput());
      const replay = await createProjectDraft(store, createInput());
      const stored = await db.query<{
        project_count: number;
        script_count: number;
        idempotency_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects) AS project_count,
            (SELECT count(*)::int FROM scripts) AS script_count,
            (SELECT count(*)::int FROM idempotency_records WHERE status = 'succeeded') AS idempotency_count
        `,
      );

      assert.equal(first.project.phase, "script_input");
      assert.equal(first.script.status, "ready");
      assert.equal(replay.project.id, first.project.id);
      assert.equal(replay.script.id, first.script.id);
      assert.equal(replay.idempotencyResult, "replayed");
      assert.deepEqual(stored.rows[0], {
        project_count: 1,
        script_count: 1,
        idempotency_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("rejects invalid input without writing SQL records", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const store = new SqlProjectStore(db);

      await assert.rejects(
        createProjectDraft(store, {
          ...createInput(),
          name: "",
          scriptInput: "",
        }),
      );

      const stored = await db.query<{
        project_count: number;
        script_count: number;
        idempotency_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects) AS project_count,
            (SELECT count(*)::int FROM scripts) AS script_count,
            (SELECT count(*)::int FROM idempotency_records) AS idempotency_count
        `,
      );

      assert.deepEqual(stored.rows[0], {
        project_count: 0,
        script_count: 0,
        idempotency_count: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("persists parse script workflow requests through the SQL workflow spine", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const store = new SqlProjectStore(db);
      const created = await createProjectDraft(store, createInput());

      const first = await createParseScriptWorkflowRequest(store, {
        organizationId: createInput().organizationId,
        projectId: created.project.id,
        scriptId: created.script.id,
        createdByUserId: createInput().createdByUserId,
        idempotencyKey: "parse-script-sql",
        requestWorkflow: async (input) => {
          const workflow = await createWorkflowWithTasks(db, {
            organizationId: created.project.organizationId,
            workspaceId: created.project.workspaceId,
            projectId: created.project.id,
            workflowType: input.operationName,
            inputSnapshot: {
              projectId: input.projectId,
              scriptId: input.scriptId,
            },
            createdByUserId: input.createdByUserId,
            tasks: [
              {
                taskType: "parse_script",
                queueName: "workflow-control",
                targetEntityType: "script",
                targetEntityId: input.scriptId,
                inputSnapshot: {
                  scriptId: input.scriptId,
                },
              },
            ],
          });

          return {
            workflowId: workflow.workflow.id,
            taskId: workflow.tasks[0]!.id,
            taskStatus: workflow.tasks[0]!.status,
          };
        },
      });
      const replay = await createParseScriptWorkflowRequest(store, {
        organizationId: createInput().organizationId,
        projectId: created.project.id,
        scriptId: created.script.id,
        createdByUserId: createInput().createdByUserId,
        idempotencyKey: "parse-script-sql",
        requestWorkflow: async () => {
          throw new Error("workflow_should_replay");
        },
      });
      const stored = await db.query<{
        workflow_count: number;
        task_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows) AS workflow_count,
            (SELECT count(*)::int FROM tasks) AS task_count
        `,
      );

      assert.equal(first.idempotencyResult, "created");
      assert.equal(replay.idempotencyResult, "replayed");
      assert.equal(replay.workflow.workflowId, first.workflow.workflowId);
      assert.deepEqual(stored.rows[0], {
        workflow_count: 1,
        task_count: 1,
      });
    } finally {
      await db.close();
    }
  });
});

function createInput() {
  return {
    organizationId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    createdByUserId: "00000000-0000-4000-8000-000000000001",
    name: "Pilot Episode",
    scriptInput: "Episode: a creator tests durable SQL state.",
    aspectRatio: "9:16",
    resolution: "1080p",
    idempotencyKey: `${operationNames.projectCreate}:pilot`,
  };
}

async function seedTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'active')
    `,
  );
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
}
