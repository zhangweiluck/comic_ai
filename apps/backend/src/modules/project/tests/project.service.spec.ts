import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../packages/contracts/domain/operation-names.ts";
import { projectPhases } from "../../../../../../packages/contracts/domain/states.ts";
import { beginOrReplayCommand, IdempotencyProcessingError } from "../../shared/idempotency/idempotency.service.ts";
import {
  CreateProjectValidationError,
  InMemoryProjectStore,
  createProjectDraft,
} from "../project.service.ts";
import { createProjectCommandFixture } from "../project-readiness.ts";

describe("project service", () => {
  it("creates a project and initial script together for the creator flow", async () => {
    const store = new InMemoryProjectStore();
    const fixture = createProjectCommandFixture();

    const created = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: fixture.workspaceId,
      createdByUserId: "user_1",
      name: fixture.name,
      scriptInput: fixture.scriptInput,
      aspectRatio: fixture.aspectRatio,
      resolution: fixture.resolution,
      idempotencyKey: fixture.idempotencyKey,
    });

    assert.equal(created.project.phase, "script_input");
    assert.equal(projectPhases.includes(created.project.phase), true);
    assert.equal(created.script.status, "ready");
    assert.equal(created.script.projectId, created.project.id);
    assert.equal(created.idempotencyRecord.operationName, operationNames.projectCreate);
  });

  it("replays the same project for the same idempotency key and request", async () => {
    const store = new InMemoryProjectStore();
    const fixture = createProjectCommandFixture();

    const first = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: fixture.workspaceId,
      createdByUserId: "user_1",
      name: fixture.name,
      scriptInput: fixture.scriptInput,
      aspectRatio: fixture.aspectRatio,
      resolution: fixture.resolution,
      idempotencyKey: fixture.idempotencyKey,
    });

    const replay = await createProjectDraft(store, {
      organizationId: "org_1",
      workspaceId: fixture.workspaceId,
      createdByUserId: "user_1",
      name: fixture.name,
      scriptInput: fixture.scriptInput,
      aspectRatio: fixture.aspectRatio,
      resolution: fixture.resolution,
      idempotencyKey: fixture.idempotencyKey,
    });

    assert.equal(replay.project.id, first.project.id);
    assert.equal(replay.script.id, first.script.id);
    assert.equal(replay.idempotencyResult, "replayed");
  });

  it("does not create a duplicate project while the same operation key is already processing", async () => {
    const store = new InMemoryProjectStore();
    const fixture = createProjectCommandFixture();
    const requestHash = hashCreateProjectRequest({
      workspaceId: fixture.workspaceId,
      name: fixture.name,
      scriptInput: fixture.scriptInput,
      aspectRatio: fixture.aspectRatio,
      resolution: fixture.resolution,
    });

    await beginOrReplayCommand(store.idempotency, {
      organizationId: "org_1",
      operationName: operationNames.projectCreate,
      idempotencyKey: fixture.idempotencyKey,
      requestHash,
    });

    await assert.rejects(
      createProjectDraft(store, {
        organizationId: "org_1",
        workspaceId: fixture.workspaceId,
        createdByUserId: "user_1",
        name: fixture.name,
        scriptInput: fixture.scriptInput,
        aspectRatio: fixture.aspectRatio,
        resolution: fixture.resolution,
        idempotencyKey: fixture.idempotencyKey,
      }),
      (error: unknown) => {
        assert.ok(error instanceof IdempotencyProcessingError);
        assert.equal(error.record.operationName, operationNames.projectCreate);
        return true;
      },
    );
  });

  it("rejects invalid creator input with field-level errors", async () => {
    const store = new InMemoryProjectStore();

    await assert.rejects(
      createProjectDraft(store, {
        organizationId: "org_1",
        workspaceId: "workspace_1",
        createdByUserId: "user_1",
        name: "",
        scriptInput: "",
        aspectRatio: "1:1",
        resolution: "4k",
        idempotencyKey: "invalid-project",
      }),
      (error: unknown) => {
        assert.ok(error instanceof CreateProjectValidationError);
        assert.deepEqual(error.fieldErrors, {
          name: "name_length",
          scriptInput: "script_required",
          aspectRatio: "aspect_ratio_unsupported",
          resolution: "resolution_unsupported",
        });
        return true;
      },
    );
  });
});

function hashCreateProjectRequest(input: {
  workspaceId: string;
  name: string;
  scriptInput: string;
  aspectRatio: string;
  resolution: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        scriptInput: input.scriptInput.trim(),
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
      }),
    )
    .digest("hex");
}
