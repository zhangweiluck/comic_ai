import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createProjectCommand } from "../../../../../../packages/contracts/api/project.commands.ts";
import { InMemoryProjectStore } from "../project.service.ts";
import { createProjectCommandFixture } from "../project-readiness.ts";
import { createProjectCommandHandler } from "../create-project.command.ts";

describe("create project command handler", () => {
  it("creates a project through injected actor and audit boundaries", async () => {
    const store = new InMemoryProjectStore();
    const auditLog: Array<{ eventType: string; targetId: string }> = [];

    const handler = createProjectCommandHandler({
      store,
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [capabilities.projectCreate],
      }),
      appendAuditEvent: async (event) => {
        auditLog.push({ eventType: event.eventType, targetId: event.targetId });
      },
    });

    const fixture = createProjectCommandFixture();
    const response = await handler({
      auth: { sessionToken: "session_1" },
      body: fixture,
      idempotencyKey: fixture.idempotencyKey,
      now: new Date("2026-05-15T10:00:00.000Z"),
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.project.phase, "script_input");
    assert.equal(response.body.script.status, "ready");
    assert.deepEqual(auditLog, [
      { eventType: createProjectCommand.auditEvent, targetId: response.body.project.id },
    ]);
  });

  it("rejects callers without project:create capability", async () => {
    const handler = createProjectCommandHandler({
      store: new InMemoryProjectStore(),
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [],
      }),
      appendAuditEvent: async () => {},
    });

    const fixture = createProjectCommandFixture();
    const response = await handler({
      auth: { sessionToken: "session_1" },
      body: fixture,
      idempotencyKey: fixture.idempotencyKey,
      now: new Date("2026-05-15T10:00:00.000Z"),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "forbidden" });
  });

  it("returns field-level validation errors for invalid input", async () => {
    const handler = createProjectCommandHandler({
      store: new InMemoryProjectStore(),
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [capabilities.projectCreate],
      }),
      appendAuditEvent: async () => {},
    });

    const response = await handler({
      auth: { sessionToken: "session_1" },
      body: {
        workspaceId: "workspace_1",
        name: "",
        scriptInput: "",
        aspectRatio: "1:1",
        resolution: "4k",
      },
      idempotencyKey: "invalid-create-project",
      now: new Date("2026-05-15T10:00:00.000Z"),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: "invalid_project_input",
      fieldErrors: {
        name: "name_length",
        scriptInput: "script_required",
        aspectRatio: "aspect_ratio_unsupported",
        resolution: "resolution_unsupported",
      },
    });
  });

  it("replays the same project without duplicating audit events", async () => {
    const store = new InMemoryProjectStore();
    const auditLog: string[] = [];
    const handler = createProjectCommandHandler({
      store,
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [capabilities.projectCreate],
      }),
      appendAuditEvent: async (event) => {
        auditLog.push(event.targetId);
      },
    });

    const fixture = createProjectCommandFixture();
    const first = await handler({
      auth: { sessionToken: "session_1" },
      body: fixture,
      idempotencyKey: fixture.idempotencyKey,
      now: new Date("2026-05-15T10:00:00.000Z"),
    });
    const replay = await handler({
      auth: { sessionToken: "session_1" },
      body: fixture,
      idempotencyKey: fixture.idempotencyKey,
      now: new Date("2026-05-15T10:00:01.000Z"),
    });

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.project.id, first.body.project.id);
    assert.deepEqual(auditLog, [first.body.project.id]);
  });

  it("returns 409 when the same idempotency key is reused with a different request", async () => {
    const store = new InMemoryProjectStore();
    const auditLog: string[] = [];
    const handler = createProjectCommandHandler({
      store,
      resolveActorContext: async () => ({
        actorId: "user_1",
        organizationId: "org_1",
        workspaceId: "workspace_1",
        capabilities: [capabilities.projectCreate],
      }),
      appendAuditEvent: async (event) => {
        auditLog.push(event.targetId);
      },
    });

    const fixture = createProjectCommandFixture();
    const first = await handler({
      auth: { sessionToken: "session_1" },
      body: fixture,
      idempotencyKey: fixture.idempotencyKey,
      now: new Date("2026-05-15T10:00:00.000Z"),
    });
    const conflict = await handler({
      auth: { sessionToken: "session_1" },
      body: {
        ...fixture,
        name: "Different title",
      },
      idempotencyKey: fixture.idempotencyKey,
      now: new Date("2026-05-15T10:00:01.000Z"),
    });

    assert.equal(first.status, 200);
    assert.equal(conflict.status, 409);
    assert.deepEqual(conflict.body, { error: "idempotency_conflict" });
    assert.deepEqual(auditLog, [first.body.project.id]);
  });
});
