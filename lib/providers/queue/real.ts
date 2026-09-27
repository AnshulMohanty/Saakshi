/** Inngest-backed queue (INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY). Phase 8. */
import { NotConfiguredError } from "../../errors";
import type { EventName, QueueEvents, QueueProvider } from "./index";

export class InngestQueue implements QueueProvider {
  readonly kind = "real" as const;

  async send<E extends EventName>(event: E, data: QueueEvents[E]): Promise<void> {
    void event;
    void data;
    throw new NotConfiguredError("InngestQueue", "send");
  }
}
