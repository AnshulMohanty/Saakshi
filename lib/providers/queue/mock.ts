/** Inline queue: runs handlers in-process as soon as an event is sent. */
import type { EventName, HandlerRegistry, QueueEvents, QueueProvider } from "./index";

export class InlineQueue implements QueueProvider {
  readonly kind = "mock" as const;

  constructor(private readonly registry: HandlerRegistry) {}

  async send<E extends EventName>(event: E, data: QueueEvents[E]): Promise<void> {
    for (const handler of this.registry.get(event)) await handler(data);
  }
}
