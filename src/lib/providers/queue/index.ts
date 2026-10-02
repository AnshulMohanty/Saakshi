/**
 * QueueProvider: fire pipeline events.
 * - inline (default): handlers run in-process, concurrency 4 (p-limit); `send` returns at once.
 * - QUEUE=inngest-dev: real Inngest functions via the local Inngest Dev Server (no account).
 * - INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY: Inngest cloud.
 * Handlers must be idempotent, keyed by asset id: real queues retry and may deliver twice.
 */
import "server-only";
import { getConfig } from "../../config";
import { InlineQueue } from "./mock";
import { InngestQueue } from "./real";

/** Event name → payload. */
export interface QueueEvents {
  "asset.uploaded": { assetId: string };
}
export type EventName = keyof QueueEvents;
export type Handler<E extends EventName> = (data: QueueEvents[E]) => Promise<void>;

export interface QueueProvider {
  readonly kind: "mock" | "real";
  send<E extends EventName>(event: E, data: QueueEvents[E]): Promise<void>;
  /** Resolves when all in-flight work has finished (inline only; no-op on Inngest). */
  drain(): Promise<void>;
}

export class HandlerRegistry {
  private readonly handlers = new Map<EventName, Array<Handler<EventName>>>();

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler<EventName>);
    this.handlers.set(event, list);
    return () => this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== handler));
  }

  get<E extends EventName>(event: E): Array<Handler<E>> {
    return (this.handlers.get(event) ?? []) as Array<Handler<E>>;
  }
}

export const handlers = new HandlerRegistry();

let instance: QueueProvider | undefined;

export function getQueue(): QueueProvider {
  if (!instance) {
    const { providers, env } = getConfig();
    instance =
      providers.queue.mode === "real"
        ? new InngestQueue({ dev: !(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY) })
        : new InlineQueue(handlers, { concurrency: 4 });
  }
  return instance;
}
