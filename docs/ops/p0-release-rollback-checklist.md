# P0 Release And Rollback Checklist

This checklist is the release gate for Developer C task C9.

## Pre-release

- Confirm the repository is on the intended branch and the worktree contains only expected changes.
- Run the full regression suite:

```bash
npm test -- apps packages
```

- Run the P0 creator E2E suite:

```bash
npm test -- apps/web/e2e/p0
```

- Confirm the local dev server starts with the same command documented for operators:

```bash
npm run dev:phone-auth
```

- Confirm Admin/Ops Lite can list stuck tasks and rejects non-ops users with 403.
- Confirm every manual action requires a reason and writes an audit event.

## Smoke Test

- Login with a phone code.
- Restore the session through `/api/auth/session`.
- Create a project.
- Parse the script.
- Confirm assets.
- Run or skip calibration with a reason when skipping.
- Generate images and videos.
- Build an export preview.
- Load export history.
- Capture any failure response with its stable error code and `traceId` when present.

## Rollback

Rollback immediately if any of these conditions are true:

- `npm test -- apps packages` fails on a release candidate.
- `npm test -- apps/web/e2e/p0` fails twice with the same endpoint or state transition.
- Users can trigger generation without durable asset review and calibration state.
- Admin/Ops Lite allows retry or settlement without a reason.
- Admin/Ops Lite allows non-ops users to inspect or mutate stuck tasks.
- Manual settlement does not create an `audit_events` record.

## After Rollback

- Save the failing command, endpoint, response body, and relevant task/provider ids.
- Query `workflows`, `tasks`, `task_attempts`, and `provider_requests` for `result_unknown` or `manual_review_required`.
- Record the rollback reason in the release note.
- Re-run `npm test -- apps/web/e2e/p0` before attempting another release.
