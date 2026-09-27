/**
 * QueueProvider: fire pipeline events. Real = Inngest; mock = inline runner that calls the
 * registered handlers directly (awaited, in registration order). Handlers must be idempotent,
 * keyed by asset id: real queues retry and may deliver more than once.
 */
import "server-only";
import { getConfig } from "../../config";
import { InlineQueue } from "./mock";
import { InngestQueue } from "./real";

/** Event name → payload. Pipeline phases add their events here. */
export interface QueueEvents {
  "asset/uploaded": { assetId: string };
}
export type EventName = keyof QueueEvents;
export type Handler<E extends EventName> = (data: QueueEvents[E]) => Promise<void>;

export interface QueueProvider {
  readonly kind: "mock" | "real";
  send<E extends EventName>(event: E, data: QueueEvents[E]): Promise<void>;
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
    instance = getConfig().providers.queue.mode === "real" ? new InngestQueue() : new InlineQueue(handlers);
  }
  return instance;
}
