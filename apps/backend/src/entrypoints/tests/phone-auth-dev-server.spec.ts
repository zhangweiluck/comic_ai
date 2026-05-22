import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("phone auth dev server", () => {
  it("serves the login page and static assets", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const response = await fetch(`${server.origin}/login.html`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /id="login-form"/);
    } finally {
      await server.close();
    }
  });

  it("supports the full request -> debug -> verify -> session flow", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();

      const debugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
      );
      const debug = await debugResponse.json();

      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
        }),
      });
      const verifyPayload = await verifyResponse.json();
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";

      const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
        headers: { cookie },
      });
      const sessionPayload = await sessionResponse.json();

      assert.equal(requestResponse.status, 200);
      assert.equal(debugResponse.status, 200);
      assert.equal(verifyResponse.status, 200);
      assert.equal(sessionResponse.status, 200);
      assert.equal(verifyPayload.user.phone, "+8613800138000");
      assert.equal(sessionPayload.authenticated, true);
    } finally {
      await server.close();
    }
  });

  it("exposes a creator workflow API that can create, parse, and export a mock project", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();
      const debugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
      );
      const debug = await debugResponse.json();
      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
        }),
      });
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";

      const createResponse = await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator flow smoke test",
          scriptInput: "Episode 1: Dawn over the mechanical city.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: { cookie },
      });
      const parsed = await parseResponse.json();

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      const confirmed = await confirmResponse.json();

      const calibrationResponse = await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: { cookie },
      });
      const calibration = await calibrationResponse.json();

      const imageResponse = await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: { cookie },
      });
      const imageBatch = await imageResponse.json();

      const exportResponse = await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: { cookie },
      });
      const exportPreview = await exportResponse.json();

      assert.equal(requestResponse.status, 200);
      assert.equal(debugResponse.status, 200);
      assert.equal(verifyResponse.status, 200);
      assert.equal(createResponse.status, 200);
      assert.equal(parseResponse.status, 202);
      assert.equal(confirmResponse.status, 200);
      assert.equal(calibrationResponse.status, 200);
      assert.equal(imageResponse.status, 200);
      assert.equal(exportResponse.status, 200);
      assert.equal(created.project.phase, "script_input");
      assert.ok(parsed.workflow);
      assert.ok(parsed.assetReview);
      assert.equal(confirmed.assetReview.readyForGeneration, true);
      assert.equal(calibration.calibration.status, "passed");
      assert.equal(calibration.auditEvent.eventType, "calibration.passed");
      assert.ok(imageBatch.successes.length > 0);
      assert.equal(exportPreview.export.status, "ready");
      assert.equal(exportPreview.exportRecord.manifestStatus, "ready");
    } finally {
      await server.close();
    }
  });

  it("supports single-asset editing plus calibration skip/override and export history routes", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "13800138000" }),
      });
      const requested = await requestResponse.json();
      const debugResponse = await fetch(
        `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
      );
      const debug = await debugResponse.json();
      const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: requested.challengeId,
          phone: "13800138000",
          code: debug.code,
        }),
      });
      const cookie = verifyResponse.headers.get("set-cookie") ?? "";

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator controls smoke test",
          scriptInput: "Episode 2: The hero enters the neon forest with a lantern.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });

      const parseResponse = await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: { cookie },
      });
      const parsed = await parseResponse.json();
      const firstCharacter = parsed.parse.candidateAssets.find(
        (candidate: { kind: string }) => candidate.kind === "character",
      );

      const confirmResponse = await fetch(`${server.origin}/api/creator/assets/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          group: "character",
          assetKey: firstCharacter.id,
        }),
      });
      const confirmed = await confirmResponse.json();

      const renameResponse = await fetch(`${server.origin}/api/creator/assets/update-label`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          group: "character",
          assetKey: firstCharacter.id,
          label: "Hero Prime",
        }),
      });
      const renamed = await renameResponse.json();

      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });

      const skipWithoutReasonResponse = await fetch(
        `${server.origin}/api/creator/calibration/skip`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            reason: " ",
          }),
        },
      );
      const skipWithoutReason = await skipWithoutReasonResponse.json();

      const skipResponse = await fetch(`${server.origin}/api/creator/calibration/skip`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          reason: "Approved style frames already cover this sequence.",
        }),
      });
      const skipped = await skipResponse.json();

      const overrideResponse = await fetch(
        `${server.origin}/api/creator/calibration/override`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            reason: "Director approved a deliberate departure from the calibration frame.",
          }),
        },
      );
      const overridden = await overrideResponse.json();

      await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/export/preview`, {
        method: "POST",
        headers: { cookie },
      });

      const historyResponse = await fetch(`${server.origin}/api/creator/export/history`, {
        method: "GET",
        headers: { cookie },
      });
      const history = await historyResponse.json();

      assert.equal(confirmResponse.status, 200);
      assert.equal(
        confirmed.assetCandidates.characters.some(
          (candidate: { assetKey: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id && candidate.confirmed,
        ),
        true,
      );
      assert.equal(renameResponse.status, 200);
      assert.equal(
        renamed.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string }) =>
            candidate.assetKey === firstCharacter.id,
        )?.label,
        "Hero Prime",
      );
      assert.equal(skipWithoutReasonResponse.status, 400);
      assert.equal(skipWithoutReason.error, "reason_required");
      assert.equal(skipResponse.status, 200);
      assert.equal(skipped.auditEvent.eventType, "calibration.skipped");
      assert.equal(overrideResponse.status, 200);
      assert.equal(overridden.auditEvent.eventType, "calibration.override");
      assert.equal(historyResponse.status, 200);
      assert.equal(history.records.length, 1);
      assert.equal(history.records[0]?.manifestStatus, "ready");
    } finally {
      await server.close();
    }
  });

  it("rejects creator-side single shot retry routes before a shot has failed", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);

      const cookie = await login(server.origin, "13800138000");

      await fetch(`${server.origin}/api/creator/project/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          name: "Creator retry route smoke test",
          scriptInput: "Episode 3: A creator retries one failed frame.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: { cookie },
      });

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const state = await stateResponse.json();
      const shotId = state.shots[0].id;

      const imageRetryResponse = await fetch(
        `${server.origin}/api/creator/shots/${shotId}/image/retry`,
        {
          method: "POST",
          headers: { cookie },
        },
      );
      const imageRetry = await imageRetryResponse.json();
      const videoRetryResponse = await fetch(
        `${server.origin}/api/creator/shots/${shotId}/video/retry`,
        {
          method: "POST",
          headers: { cookie },
        },
      );
      const videoRetry = await videoRetryResponse.json();

      assert.equal(imageRetryResponse.status, 409);
      assert.equal(videoRetryResponse.status, 409);
      assert.deepEqual(imageRetry, { error: "shot_image_retry_unavailable" });
      assert.deepEqual(videoRetry, { error: "current_image_required" });
    } finally {
      await server.close();
    }
  });

  it("exposes a package script for starting the dev server", async () => {
    const packageJson = await readFile(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    );
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );

    assert.match(packageJson, /"dev:phone-auth"/);
    assert.match(packageJson, /--import tsx/);
    assert.match(packageJson, /run-phone-auth-dev-server\.mjs/);
    assert.match(launcherScript, /phone-auth-dev-server\.ts/);
  });

  it("uses an import-based launcher that starts the dev server explicitly", async () => {
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );
    const packageJson = await readFile(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    );

    assert.match(launcherScript, /createPhoneAuthDevServer/);
    assert.match(launcherScript, /server\.listen\(port\)/);
    assert.match(launcherScript, /process\.env\.PORT/);
    assert.match(packageJson, /--import tsx/);
    assert.doesNotMatch(launcherScript, /--loader/);
    assert.match(launcherScript, /loadDotEnvFile/);
    assert.match(launcherScript, /\.env/);
  });
});

async function login(origin: string, phone: string) {
  const requestResponse = await fetch(`${origin}/api/auth/code/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const requested = await requestResponse.json();
  const debugResponse = await fetch(
    `${origin}/api/auth/dev/challenges/${requested.challengeId}`,
  );
  const debug = await debugResponse.json();
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: requested.challengeId,
      phone,
      code: debug.code,
    }),
  });

  assert.equal(verifyResponse.status, 200);
  return verifyResponse.headers.get("set-cookie") ?? "";
}
