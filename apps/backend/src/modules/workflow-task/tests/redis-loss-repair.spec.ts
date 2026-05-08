import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectQueuedTasksForRedisRepair } from "../queued-task-dispatch-repair.contract.ts";

describe("queued task dispatch repair", () => {
  it("selects queued tasks whose BullMQ dispatch is missing or stale", () => {
    const now = new Date("2026-05-08T10:00:00.000Z");
    const staleDispatchedAt = new Date("2026-05-08T09:57:00.000Z");
    const freshDispatchedAt = new Date("2026-05-08T09:59:30.000Z");

    const selected = selectQueuedTasksForRedisRepair(
      [
        {
          id: "task_missing",
          status: "queued",
          scheduledAt: new Date("2026-05-08T09:59:00.000Z"),
          lastDispatchedAt: undefined,
        },
        {
          id: "task_stale",
          status: "queued",
          scheduledAt: new Date("2026-05-08T09:59:00.000Z"),
          lastDispatchedAt: staleDispatchedAt,
        },
        {
          id: "task_fresh",
          status: "queued",
          scheduledAt: new Date("2026-05-08T09:59:00.000Z"),
          lastDispatchedAt: freshDispatchedAt,
        },
        {
          id: "task_running",
          status: "running",
          scheduledAt: new Date("2026-05-08T09:59:00.000Z"),
          lastDispatchedAt: staleDispatchedAt,
        },
      ],
      now,
    );

    assert.deepEqual(
      selected.map((task) => task.id),
      ["task_missing", "task_stale"],
    );
  });
});
