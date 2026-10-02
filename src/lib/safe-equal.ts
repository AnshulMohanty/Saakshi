import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison. Compares UTF-8 byte lengths first, so it never throws. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
