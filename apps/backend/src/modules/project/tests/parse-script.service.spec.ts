import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../packages/contracts/domain/operation-names.ts";
import { beginOrReplayCommand, IdempotencyProcessingError } from "../../shared/idempotency/idempotency.service.ts";
import {
  createDeterministicMockParseResult,
  createParseScriptWorkflowRequest,
  ParseScriptStateError,
} from "../parse-script.service.ts";
import { createProjectDraft, InMemoryProjectStore } from "../project.service.ts";
import { createProjectCommandFixture, createParseScriptCommandFixture } from "../project-readiness.ts";

describe("parse script service", () => {
  it("creates a durable workflow request and deterministic mock parse output", async () => {
    const store = new InMemoryProjectStore();
    const created = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      createdByUserId: "user_1",
      ...createProjectCommandFixture(),
    });

    const requestedWorkflows: Array<{
      projectId: string;
      scriptId: string;
      operationName: string;
      createdByUserId: string;
    }> = [];
    const parse = await createParseScriptWorkflowRequest(store, {
      organizationId: "org_1",
      projectId: created.project.id,
      scriptId: created.script.id,
      createdByUserId: "user_1",
      idempotencyKey: createParseScriptCommandFixture().idempotencyKey,
      requestWorkflow: async (input) => {
        requestedWorkflows.push(input);
        return {
          workflowId: "workflow_1",
          taskId: "task_1",
          taskStatus: "queued",
        };
      },
    });

    assert.equal(parse.workflow.workflowId, "workflow_1");
    assert.equal(parse.workflow.taskId, "task_1");
    assert.equal(parse.idempotencyResult, "created");
    assert.deepEqual(requestedWorkflows, [
      {
        projectId: created.project.id,
        scriptId: created.script.id,
        operationName: operationNames.scriptParse,
        createdByUserId: "user_1",
      },
    ]);
    assert.deepEqual(
      createDeterministicMockParseResult(created.script.inputText).episodes.map((episode) => episode.id),
      ["episode-001"],
    );
  });

  it("replays the same workflow for repeated parse requests", async () => {
    const store = new InMemoryProjectStore();
    const created = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      createdByUserId: "user_1",
      ...createProjectCommandFixture(),
    });

    let workflowRequests = 0;
    const requestWorkflow = async () => {
      workflowRequests += 1;
      return {
        workflowId: "workflow_2",
        taskId: "task_2",
        taskStatus: "queued" as const,
      };
    };

    const first = await createParseScriptWorkflowRequest(store, {
      organizationId: "org_1",
      projectId: created.project.id,
      scriptId: created.script.id,
      createdByUserId: "user_1",
      idempotencyKey: "parse-script-replay",
      requestWorkflow,
    });
    const replay = await createParseScriptWorkflowRequest(store, {
      organizationId: "org_1",
      projectId: created.project.id,
      scriptId: created.script.id,
      createdByUserId: "user_1",
      idempotencyKey: "parse-script-replay",
      requestWorkflow,
    });

    assert.equal(first.workflow.workflowId, "workflow_2");
    assert.equal(replay.workflow.workflowId, "workflow_2");
    assert.equal(replay.idempotencyResult, "replayed");
    assert.equal(workflowRequests, 1);
  });

  it("does not create a second workflow while the same parse key is already processing", async () => {
    const store = new InMemoryProjectStore();
    const created = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      createdByUserId: "user_1",
      ...createProjectCommandFixture(),
    });
    const idempotencyKey = "parse-script-processing";

    await beginOrReplayCommand(store.idempotency, {
      organizationId: "org_1",
      operationName: operationNames.scriptParse,
      idempotencyKey,
      requestHash: JSON.stringify({
        projectId: created.project.id,
        scriptId: created.script.id,
      }),
    });

    let workflowRequests = 0;
    await assert.rejects(
      createParseScriptWorkflowRequest(store, {
        organizationId: "org_1",
        projectId: created.project.id,
        scriptId: created.script.id,
        createdByUserId: "user_1",
        idempotencyKey,
        requestWorkflow: async () => {
          workflowRequests += 1;
          return {
            workflowId: "workflow_duplicate",
            taskId: "task_duplicate",
            taskStatus: "queued",
          };
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof IdempotencyProcessingError);
        assert.equal(error.record.operationName, operationNames.scriptParse);
        return true;
      },
    );
    assert.equal(workflowRequests, 0);
  });

  it("rejects parse when project and script are not in a parseable state", async () => {
    const store = new InMemoryProjectStore();
    const created = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      createdByUserId: "user_1",
      ...createProjectCommandFixture(),
    });

    const script = await store.findScript(created.script.id);
    assert.ok(script);
    await store.updateScript({
      ...script,
      status: "draft",
    });

    await assert.rejects(
      createParseScriptWorkflowRequest(store, {
        organizationId: "org_1",
        projectId: created.project.id,
        scriptId: created.script.id,
        createdByUserId: "user_1",
        idempotencyKey: "parse-script-invalid",
        requestWorkflow: async () => ({
          workflowId: "workflow_3",
          taskId: "task_3",
          taskStatus: "queued",
        }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof ParseScriptStateError);
        assert.equal(error.code, "script_not_ready");
        return true;
      },
    );
  });
});
