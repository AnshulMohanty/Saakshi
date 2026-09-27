/**
 * Inline queue: runs registered handlers in-process with bounded concurrency. `send` enqueues
 * and returns immediately (so HTTP handlers can respond); `drain()` waits for everything.
 * Handler errors are logged, not thrown: the pipeline records them on the failed step.
 */
import pLimit from "p-limit";
import type { EventName, HandlerRegistry, QueueEvents, QueueProvider } from "./index";

export class InlineQueue implements QueueProvider {
  readonly kind = "mock" as const;
  private readonly limit: ReturnType<typeof pLimit>;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly registry: HandlerRegistry,
    { concurrency = 4, onError }: { concurrency?: number; onError?: (event: string, err: unknown) => void } = {},
  ) {
    this.limit = pLimit(concurrency);
    this.onError = onError ?? ((event, err) => console.error(`[queue] ${event} handler failed:`, err instanceof Error ? err.message : err));
  }

  private readonly onError: (event: string, err: unknown) => void;

  async send<E extends EventName>(event: E, data: QueueEvents[E]): Promise<void> {
    for (const handler of this.registry.get(event)) {
      const task = this.limit(() => handler(data)).catch((err) => this.onError(event, err));
      this.pending.add(task);
      void task.finally(() => this.pending.delete(task));
    }
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  get activeCount(): number {
    return this.limit.activeCount + this.limit.pendingCount;
  }
}
