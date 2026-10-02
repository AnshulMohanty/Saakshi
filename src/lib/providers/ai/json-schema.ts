/**
 * Zod → JSON Schema for OpenAI Structured Outputs in strict mode (pure). The docs' rules: the root
 * is an object, every object lists all its properties in `required` and sets
 * `additionalProperties: false`, optional values are null unions, and only the supported keywords
 * appear. Zod's own output is close; this enforces the rules and drops what strict mode rejects.
 */
import { z } from "zod";

type Json = Record<string, unknown>;

/** Keywords strict mode does not support (docs: structured outputs, supported schemas). */
const UNSUPPORTED = new Set(["$schema", "allOf", "not", "dependentRequired", "dependentSchemas", "if", "then", "else", "default"]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (UNSUPPORTED.has(k)) continue;
    // Zod writes Number.MAX_SAFE_INTEGER bounds for .int(); they add nothing.
    if ((k === "maximum" || k === "minimum") && Math.abs(v as number) >= Number.MAX_SAFE_INTEGER) continue;
    out[k] = clean(v);
  }
  if (out.type === "object" || (Array.isArray(out.type) && out.type.includes("object"))) {
    const props = (out.properties ?? {}) as Json;
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

export function strictJsonSchema(schema: z.ZodType): Json {
  const json = clean(z.toJSONSchema(schema, { io: "output" })) as Json;
  if (json.type !== "object") throw new Error("Structured Outputs need an object at the root");
  return json;
}
