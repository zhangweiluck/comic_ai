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

  it("exposes project management, asset library, shot editing, and parameterized generation routes", async () => {
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
          name: "Creator backend gap coverage",
          scriptInput: "Episode 6: Backend gap coverage needs editable shots.",
          aspectRatio: "9:16",
          resolution: "1080p",
        }),
      });
      const created = await createResponse.json();

      const projectsResponse = await fetch(`${server.origin}/api/creator/projects`, {
        headers: { cookie },
      });
      const projects = await projectsResponse.json();

      const patchResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          name: "Creator backend gap coverage renamed",
        }),
      });
      const patched = await patchResponse.json();

      const coverResponse = await fetch(`${server.origin}/api/creator/project/cover`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          projectId: created.project.id,
          coverImageUrl: "data:image/png;base64,cover",
        }),
      });
      const covered = await coverResponse.json();

      const generatedAssetResponse = await fetch(
        `${server.origin}/api/creator/assets/generate`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            kind: "character",
            name: "Hero Library Asset",
            prompt: "hero with blue coat",
            model: "jimeng-4",
          }),
        },
      );
      const generatedAsset = await generatedAssetResponse.json();

      const importedAssetResponse = await fetch(`${server.origin}/api/creator/assets/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          kind: "scene",
          name: "Imported Alley",
          storageObjectKey: "uploads/imported-alley.png",
          mimeType: "image/png",
          width: 1280,
          height: 720,
        }),
      });
      const importedAsset = await importedAssetResponse.json();

      const libraryResponse = await fetch(`${server.origin}/api/creator/assets/library`, {
        headers: { cookie },
      });
      const library = await libraryResponse.json();

      const versionsResponse = await fetch(
        `${server.origin}/api/creator/assets/versions/${generatedAsset.asset.id}`,
        {
          headers: { cookie },
        },
      );
      const versions = await versionsResponse.json();

      await fetch(`${server.origin}/api/creator/parse`, {
        method: "POST",
        headers: { cookie },
      });

      const createShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ title: "Inserted manual shot" }),
      });
      const createdShot = await createShotResponse.json();

      const updateShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          shotId: createdShot.shot.id,
          title: "Updated manual shot",
        }),
      });
      const updatedShot = await updateShotResponse.json();

      const stateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const state = await stateResponse.json();
      const reorderedIds = [...state.shots].reverse().map((shot: { id: string }) => shot.id);
      const reorderResponse = await fetch(`${server.origin}/api/creator/shots/reorder`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ shotIds: reorderedIds }),
      });
      const reordered = await reorderResponse.json();

      const deleteShotResponse = await fetch(`${server.origin}/api/creator/shots`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ shotId: createdShot.shot.id }),
      });
      const deletedShot = await deleteShotResponse.json();

      await fetch(`${server.origin}/api/creator/assets/confirm-all`, {
        method: "POST",
        headers: { cookie },
      });
      await fetch(`${server.origin}/api/creator/calibration/run`, {
        method: "POST",
        headers: { cookie },
      });
      const latestStateResponse = await fetch(`${server.origin}/api/creator/state`, {
        headers: { cookie },
      });
      const latestState = await latestStateResponse.json();
      const firstShotId = latestState.shots[0]?.id;
      const imageResponse = await fetch(`${server.origin}/api/creator/images/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          shotId: firstShotId,
          promptOverride: "single shot prompt",
          model: "image-model-test",
          parameters: { seed: 42 },
        }),
      });
      const imageResult = await imageResponse.json();

      const deleteProjectResponse = await fetch(`${server.origin}/api/creator/project`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ projectId: created.project.id }),
      });
      const deletedProject = await deleteProjectResponse.json();

      assert.equal(projectsResponse.status, 200);
      assert.equal(projects.projects.length, 1);
      assert.equal(patchResponse.status, 200);
      assert.equal(patched.project.name, "Creator backend gap coverage renamed");
      assert.equal(coverResponse.status, 200);
      assert.equal(covered.project.coverImageUrl, "data:image/png;base64,cover");
      assert.equal(generatedAssetResponse.status, 200);
      assert.equal(generatedAsset.asset.assetType, "character_sheet");
      assert.equal(importedAssetResponse.status, 200);
      assert.equal(importedAsset.asset.assetType, "scene_reference");
      assert.equal(libraryResponse.status, 200);
      assert.equal(library.assets.length, 2);
      assert.equal(versionsResponse.status, 200);
      assert.equal(versions.versions.length, 1);
      assert.equal(createShotResponse.status, 200);
      assert.equal(createdShot.shot.title, "Inserted manual shot");
      assert.equal(updateShotResponse.status, 200);
      assert.equal(updatedShot.shot.title, "Updated manual shot");
      assert.equal(reorderResponse.status, 200);
      assert.deepEqual(
        reordered.shots.map((shot: { id: string }) => shot.id),
        reorderedIds,
      );
      assert.equal(deleteShotResponse.status, 200);
      assert.equal(
        deletedShot.shots.some((shot: { id: string }) => shot.id === createdShot.shot.id),
        false,
      );
      assert.equal(imageResponse.status, 200);
      assert.equal(imageResult.platform.tasks.length, 1);
      assert.equal(imageResult.request.promptOverride, "single shot prompt");
      assert.equal(deleteProjectResponse.status, 200);
      assert.equal(deletedProject.deleted, true);
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
    assert.match(packageJson, /run-phone-auth-dev-server\.mjs/);
    assert.match(launcherScript, /phone-auth-dev-server\.ts/);
    assert.match(launcherScript, /tsx/);
  });

  it("uses a loader-based launcher that starts the dev server explicitly", async () => {
    const launcherScript = await readFile(
      new URL("../../../../../scripts/run-phone-auth-dev-server.mjs", import.meta.url),
      "utf8",
    );

    assert.match(launcherScript, /createPhoneAuthDevServer/);
    assert.match(launcherScript, /server\.listen\(port\)/);
    assert.match(launcherScript, /process\.env\.PORT/);
    assert.match(launcherScript, /--import|--loader/);
    assert.match(launcherScript, /loadDotEnvFile/);
    assert.match(launcherScript, /\.env/);
  });
});
