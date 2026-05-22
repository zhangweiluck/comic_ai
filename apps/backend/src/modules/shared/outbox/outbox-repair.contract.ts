export interface Inbox {
  hasConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<boolean>;
  markConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<void>;
}

export type ConsumeOutboxEventOnceResult<T> =
  | { kind: "applied"; result: T }
  | { kind: "duplicate" };

export async function consumeOutboxEventWithIdempotentEffect<T>(
  inbox: Inbox,
  input: {
    consumerName: string;
    outboxEventId: string;
    effect: () => Promise<T>;
  },
): Promise<ConsumeOutboxEventOnceResult<T>> {
  const consumed = await inbox.hasConsumed(input);
  if (consumed) {
    return { kind: "duplicate" };
  }

  const result = await input.effect();
  await inbox.markConsumed(input);
  return { kind: "applied", result };
}

export async function consumeOutboxEventOnce<T>(
  inbox: Inbox,
  input: {
    consumerName: string;
    outboxEventId: string;
    effect: () => Promise<T>;
  },
): Promise<ConsumeOutboxEventOnceResult<T>> {
  return consumeOutboxEventWithIdempotentEffect(inbox, input);
}

export class InMemoryInbox implements Inbox {
  private readonly consumed = new Set<string>();

  async hasConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<boolean> {
    return this.consumed.has(inboxKey(input));
  }

  async markConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<void> {
    this.consumed.add(inboxKey(input));
  }
}

function inboxKey(input: {
  consumerName: string;
  outboxEventId: string;
}): string {
  return `${input.consumerName}:${input.outboxEventId}`;
}
