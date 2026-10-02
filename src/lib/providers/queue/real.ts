/**
 * Inngest-backed queue. dev = local Inngest Dev Server (`npx inngest-cli@latest dev`, no
 * account); otherwise Inngest cloud using INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY from the env.
 * The functions themselves are served at /api/inngest (lib/pipeline/inngest.ts).
 */
import { Inngest } from "inngest";
import type { EventName, QueueEvents, QueueProvider } from "./index";

const g = globalThis as typeof globalThis & { __saakshiInngest?: Inngest };

/**
 * Vercel functions run for at most 300 s by default (Fluid compute, every plan). Inngest docs:
 * set checkpointing.maxRuntime a little below the platform limit, so a run goes async before the
 * platform kills it. /api/inngest exports maxDuration = 300 to match.
 */
export const INNGEST_MAX_RUNTIME = "240s";

export function getInngestClient(dev: boolean): Inngest {
  // v4 defaults to cloud mode: isDev must be explicit for the local Dev Server. Cloud mode reads
  // INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY from the environment.
  g.__saakshiInngest ??= new Inngest({ id: "saakshi", isDev: dev, ...(dev ? {} : { checkpointing: { maxRuntime: INNGEST_MAX_RUNTIME } }) });
  return g.__saakshiInngest;
}

export class InngestQueue implements QueueProvider {
  readonly kind = "real" as const;
  private readonly client: Inngest;

  constructor({ dev }: { dev: boolean }) {
    this.client = getInngestClient(dev);
  }

  async send<E extends EventName>(event: E, data: QueueEvents[E]): Promise<void> {
    await this.client.send({ name: event, data });
  }

  async drain(): Promise<void> {
    // Work runs on Inngest; nothing to wait for in-process.
  }
}
