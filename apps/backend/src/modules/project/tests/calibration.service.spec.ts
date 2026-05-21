import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CalibrationRuleError,
  createCalibrationSession,
  markCalibrationItemReviewed,
  overrideCalibrationSession,
  passCalibrationSession,
  skipCalibrationSession,
} from "../calibration.service.ts";

describe("calibration service", () => {
  it("creates a three-shot calibration session and moves to review when all items pass quality", async () => {
    let session = createCalibrationSession({
      organizationId: "org_1",
      projectId: "project_1",
      shotIds: ["shot_1", "shot_2", "shot_3"],
      createdByUserId: "user_1",
    });

    assert.equal(session.status, "generating");
    assert.equal(session.items.length, 3);

    for (const item of session.items) {
      session = markCalibrationItemReviewed(session, {
        shotId: item.shotId,
        qualityReviewResult: "passed",
      });
    }

    assert.equal(session.status, "ready_for_review");
    assert.deepEqual(
      session.items.map((item) => item.status),
      ["succeeded", "succeeded", "succeeded"],
    );
  });

  it("rejects calibration generation unless exactly three unique shots are selected", async () => {
    assert.throws(
      () =>
        createCalibrationSession({
          organizationId: "org_1",
          projectId: "project_1",
          shotIds: ["shot_1", "shot_2", "shot_2"],
          createdByUserId: "user_1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CalibrationRuleError);
        assert.equal(error.code, "invalid_calibration_selection");
        return true;
      },
    );
  });

  it("allows pass only after all calibration items pass quality review", async () => {
    let session = createCalibrationSession({
      organizationId: "org_1",
      projectId: "project_1",
      shotIds: ["shot_1", "shot_2", "shot_3"],
      createdByUserId: "user_1",
    });

    session = markCalibrationItemReviewed(session, {
      shotId: "shot_1",
      qualityReviewResult: "passed",
    });
    session = markCalibrationItemReviewed(session, {
      shotId: "shot_2",
      qualityReviewResult: "failed",
    });
    session = markCalibrationItemReviewed(session, {
      shotId: "shot_3",
      qualityReviewResult: "passed",
    });

    assert.equal(session.status, "failed");
    assert.throws(
      () =>
        passCalibrationSession(session, {
          decidedByUserId: "user_1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CalibrationRuleError);
        assert.equal(error.code, "quality_review_failed");
        return true;
      },
    );
  });

  it("records pass and skip decisions for later audit integration", async () => {
    let passable = createCalibrationSession({
      organizationId: "org_1",
      projectId: "project_1",
      shotIds: ["shot_1", "shot_2", "shot_3"],
      createdByUserId: "user_1",
    });

    for (const item of passable.items) {
      passable = markCalibrationItemReviewed(passable, {
        shotId: item.shotId,
        qualityReviewResult: "passed",
      });
    }

    const passed = passCalibrationSession(passable, {
      decidedByUserId: "user_1",
    });
    assert.equal(passed.status, "passed");
    assert.equal(passed.decision?.decisionType, "passed");
    assert.equal(passed.decision?.reason, null);

    const skipped = skipCalibrationSession(passable, {
      decidedByUserId: "user_2",
      reason: "Style already locked by approved references.",
    });
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.decision?.decisionType, "skipped");
    assert.equal(skipped.decision?.reason, "Style already locked by approved references.");
  });

  it("requires a reason when skipping calibration", async () => {
    const session = createCalibrationSession({
      organizationId: "org_1",
      projectId: "project_1",
      shotIds: ["shot_1", "shot_2", "shot_3"],
      createdByUserId: "user_1",
    });

    assert.throws(
      () =>
        skipCalibrationSession(session, {
          decidedByUserId: "user_1",
          reason: " ",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CalibrationRuleError);
        assert.equal(error.code, "reason_required");
        return true;
      },
    );
  });

  it("supports override decisions after reviewed calibration fails quality", async () => {
    let session = createCalibrationSession({
      organizationId: "org_1",
      projectId: "project_1",
      shotIds: ["shot_1", "shot_2", "shot_3"],
      createdByUserId: "user_1",
    });

    session = markCalibrationItemReviewed(session, {
      shotId: "shot_1",
      qualityReviewResult: "failed",
    });
    session = markCalibrationItemReviewed(session, {
      shotId: "shot_2",
      qualityReviewResult: "passed",
    });
    session = markCalibrationItemReviewed(session, {
      shotId: "shot_3",
      qualityReviewResult: "passed",
    });

    const overridden = overrideCalibrationSession(session, {
      decidedByUserId: "user_3",
      reason: "Director approved the stylized mismatch.",
    });

    assert.equal(overridden.status, "skipped");
    assert.equal(overridden.decision?.decisionType, "override");
    assert.equal(overridden.decision?.reason, "Director approved the stylized mismatch.");
  });
});
