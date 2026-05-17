import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createProjectCommandFixture } from "../project-readiness.ts";
import { createProjectDraft, InMemoryProjectStore } from "../project.service.ts";
import { createParseScriptCommandHandler } from "../parse-script.command.ts";

describe("parse script command handler", () => {
  it("creates a workflow request through injected actor and workflow boundaries", async () => {
    const store = new InMemoryProjectStore();
    const created = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      createdByUserId: "user_1",
      ...createProjectCommandFixture(),
    });

    const handler = createParseScriptCommandHandler({
      store,
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [capabilities.projectEdit],
      }),
      requestWorkflow: async () => ({
        workflowId: "workflow_parse_1",
        taskId: "task_parse_1",
        taskStatus: "queued",
      }),
    });

    const response = await handler({
      auth: { sessionToken: "session_1" },
      body: {
        projectId: created.project.id,
        scriptId: created.script.id,
      },
      idempotencyKey: "parse-script-command",
      now: new Date("2026-05-16T10:00:00.000Z"),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(response.body, {
      workflowId: "workflow_parse_1",
      taskId: "task_parse_1",
      taskStatus: "queued",
    });
  });

  it("rejects callers without project:edit capability", async () => {
    const handler = createParseScriptCommandHandler({
      store: new InMemoryProjectStore(),
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [],
      }),
      requestWorkflow: async () => ({
        workflowId: "workflow_parse_2",
        taskId: "task_parse_2",
        taskStatus: "queued" as const,
      }),
    });

    const response = await handler({
      auth: { sessionToken: "session_1" },
      body: {
        projectId: "project_1",
        scriptId: "script_1",
      },
      idempotencyKey: "parse-script-forbidden",
      now: new Date("2026-05-16T10:00:00.000Z"),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "forbidden" });
  });

  it("returns 409 when the same parse idempotency key is reused with a different request", async () => {
    const store = new InMemoryProjectStore();
    const firstProject = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      createdByUserId: "user_1",
      ...createProjectCommandFixture(),
    });
    const secondProject = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      createdByUserId: "user_1",
      ...createProjectCommandFixture(),
      name: "Second project",
      idempotencyKey: "create-second-project",
    });
    let workflowRequests = 0;
    const handler = createParseScriptCommandHandler({
      store,
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [capabilities.projectEdit],
      }),
      requestWorkflow: async () => {
        workflowRequests += 1;
        return {
          workflowId: `workflow_parse_${workflowRequests}`,
          taskId: `task_parse_${workflowRequests}`,
          taskStatus: "queued" as const,
        };
      },
    });

    const first = await handler({
      auth: { sessionToken: "session_1" },
      body: {
        projectId: firstProject.project.id,
        scriptId: firstProject.script.id,
      },
      idempotencyKey: "parse-conflict",
      now: new Date("2026-05-16T10:00:00.000Z"),
    });
    const conflict = await handler({
      auth: { sessionToken: "session_1" },
      body: {
        projectId: secondProject.project.id,
        scriptId: secondProject.script.id,
      },
      idempotencyKey: "parse-conflict",
      now: new Date("2026-05-16T10:00:01.000Z"),
    });

    assert.equal(first.status, 202);
    assert.equal(conflict.status, 409);
    assert.deepEqual(conflict.body, { error: "idempotency_conflict" });
    assert.equal(workflowRequests, 1);
  });
});
