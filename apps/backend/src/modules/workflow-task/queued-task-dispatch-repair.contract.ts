export interface QueuedTaskDispatchCandidate {
  id: string;
  status: string;
  scheduledAt: Date;
  lastDispatchedAt?: Date;
}

const staleDispatchMs = 2 * 60 * 1000;

export function selectQueuedTasksForRedisRepair(
  tasks: QueuedTaskDispatchCandidate[],
  now: Date,
): QueuedTaskDispatchCandidate[] {
  return tasks
    .filter((task) => task.status === "queued")
    .filter((task) => task.scheduledAt.getTime() <= now.getTime())
    .filter((task) => {
      if (!task.lastDispatchedAt) {
        return true;
      }

      return task.lastDispatchedAt.getTime() < now.getTime() - staleDispatchMs;
    })
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
