/**
 * Cloudinary's e_extract refusing a photo: HTTP 400 with x-cld-error "Invalid input for extract"
 * and an empty body. Seen in production on photos where a prompt finds nothing (a clean
 * plantation photo for "litter") and on some multi-prompt lists whose prompts each work alone.
 * The media provider retries prompt by prompt; when every prompt is refused the photo is not
 * measurable and no number is recorded (lib/measure/measure.ts).
 */
import { ProviderHttpError } from "../providers/http";

export const EXTRACT_REFUSAL = /invalid input for extract/i;

export function isExtractRefusal(err: unknown): err is ProviderHttpError {
  return err instanceof ProviderHttpError && err.provider === "cloudinary" && err.status === 400 && EXTRACT_REFUSAL.test(`${err.reason ?? ""} ${err.body}`);
}

/** Every prompt was refused: the reason goes on the photo ("not measurable: …"). */
export class ExtractRefusedError extends Error {
  constructor(
    readonly prompts: string[],
    readonly cloudinaryReason: string,
  ) {
    super(`Cloudinary refused the extraction for ${prompts.join(", ")} ("${cloudinaryReason}", HTTP 400)`);
    this.name = "ExtractRefusedError";
  }
}
