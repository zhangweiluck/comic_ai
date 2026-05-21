import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseScriptCommand } from "../../../../../../packages/contracts/api/project.commands.ts";
import { projectPhases } from "../../../../../../packages/contracts/domain/states.ts";
import {
  createDeterministicParseScriptMockOutput,
  createParseScriptCommandFixture,
  createProjectCommandFixture,
  createProjectScenarioMatrix,
  creatorDomainBlockers,
  parseScriptScenarioMatrix,
} from "../project-readiness.ts";

describe("creator domain readiness", () => {
  it("tracks all B1 delivery scenarios from the developer B plan", () => {
    assert.deepEqual(
      createProjectScenarioMatrix.map((scenario) => scenario.id),
      [
        "create-project-success",
        "create-project-invalid-input",
        "create-project-forbidden",
        "create-project-replay",
        "create-project-idempotency-conflict",
      ],
    );

    assert.equal(projectPhases.includes("script_input"), true);
    assert.equal(
      createProjectScenarioMatrix.every(
        (scenario) => scenario.verificationIds.length > 0,
      ),
      true,
    );
  });

  it("tracks durable workflow coverage for B2 parse script", () => {
    assert.deepEqual(
      parseScriptScenarioMatrix.map((scenario) => scenario.id),
      [
        "parse-script-starts-workflow",
        "parse-script-replay",
        "parse-script-failure-state",
      ],
    );
    assert.deepEqual(parseScriptCommand.verificationIds, [
      "TC-P0-001",
      "TC-P0-010",
      "IDEMP-003",
    ]);
  });

  it("keeps the historical blocker list while marking the resolved platform gates as ready", () => {
    assert.deepEqual(
      creatorDomainBlockers.map((blocker) => blocker.id),
      [
        "a2-actor-context",
        "a3-audit",
        "a4-workflow-task",
        "creator-domain-schema",
      ],
    );
    assert.equal(
      creatorDomainBlockers.every((blocker) => blocker.status === "ready"),
      true,
    );
  });

  it("provides stable fixtures for B1 and B2 test drafting", () => {
    assert.deepEqual(createProjectCommandFixture(), {
      workspaceId: "4db6f2af-5c44-4ae2-9a8b-7fdc2cc51d1d",
      name: "Launch teaser storyboard",
      scriptInput:
        "Episode 1: The creator opens with a mechanical city skyline and a tense monologue.",
      aspectRatio: "9:16",
      resolution: "1080p",
      idempotencyKey: "create-project-launch-teaser-v1",
    });
    assert.deepEqual(createParseScriptCommandFixture(), {
      projectId: "7de4cc38-16ef-45a9-9e34-5c8cf6f4e530",
      scriptId: "4c4d4c44-bf95-4eb5-bd84-fdf8b6c99dc0",
      idempotencyKey: "parse-script-launch-teaser-v1",
    });
  });

  it("keeps parse script mock output deterministic for future e2e fixtures", () => {
    const first = createDeterministicParseScriptMockOutput();
    const second = createDeterministicParseScriptMockOutput();

    assert.deepEqual(second, first);
    assert.deepEqual(
      first.episodes.map((episode) => episode.id),
      ["episode-001"],
    );
    assert.deepEqual(
      first.candidateAssets.map((asset) => asset.reviewStatus),
      ["needs_review", "needs_review", "warning_only"],
    );
    assert.deepEqual(
      first.shots.map((shot) => ({
        id: shot.id,
        contentStatus: shot.contentStatus,
        imageStatus: shot.imageStatus,
      })),
      [
        { id: "shot-001", contentStatus: "ready", imageStatus: "draft" },
        { id: "shot-002", contentStatus: "draft", imageStatus: "draft" },
        { id: "shot-003", contentStatus: "ready", imageStatus: "ready" },
      ],
    );
  });
});
