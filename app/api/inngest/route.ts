import { serve } from "inngest/next";
import { createPipelineFunctions, inngestEnabled } from "@/lib/pipeline/inngest";

/**
 * Inngest serve endpoint (QUEUE=inngest-dev or Inngest cloud keys). With the inline queue the
 * pipeline runs in-process and this route is a 404.
 */
type Handlers = ReturnType<typeof serve>;
let handlers: Handlers | null | undefined;

function get(): Handlers | null {
  if (handlers === undefined) {
    if (!inngestEnabled()) handlers = null;
    else {
      const { inngest, functions } = createPipelineFunctions();
      handlers = serve({ client: inngest, functions });
    }
  }
  return handlers;
}

const disabled = () => Response.json({ error: "Inngest is not enabled (QUEUE=inline)" }, { status: 404 });

export async function GET(req: Request, ctx: unknown) {
  const h = get();
  return h ? h.GET(req as never, ctx as never) : disabled();
}
export async function POST(req: Request, ctx: unknown) {
  const h = get();
  return h ? h.POST(req as never, ctx as never) : disabled();
}
export async function PUT(req: Request, ctx: unknown) {
  const h = get();
  return h ? h.PUT(req as never, ctx as never) : disabled();
}
