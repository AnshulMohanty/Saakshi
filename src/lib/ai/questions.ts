import type { ModerationQuestion } from "../providers/analysis";

/** Yes/no moderation questions asked of every photo. Answers feed the Trust Engine (lib/trust). */
export const MODERATION_QUESTIONS: ModerationQuestion[] = [
  { id: "watermark_or_stock", text: "Is there a visible watermark or stock-photo branding?" },
  { id: "screen_or_print", text: "Is this a photo of a screen, or of a printed photo?" },
  { id: "composited_or_generated", text: "Does the image look digitally composited or AI-generated?" },
  { id: "children_faces", text: "Are children's faces clearly visible?" },
  // Kept off public screens (the Witness Wall, the live feed); never part of the trust score.
  { id: "unsafe_content", text: "Is there nudity, gore or violence?" },
];

/**
 * Whether a photo may appear on a public screen: "pending" until the moderation answers exist,
 * "unfit" when they flag unsafe content, a reviewer rejected it, or analysis ended without
 * answers; else "fit".
 */
export function screenState(a: { moderation?: { status?: string; answers?: Record<string, boolean> } | null; pipeline?: { steps?: Record<string, { status?: string } | undefined> } | null }): "pending" | "fit" | "unfit" {
  if (a.moderation?.status === "rejected") return "unfit";
  const answers = a.moderation?.answers;
  if (answers) return answers.unsafe_content ? "unfit" : "fit";
  const st = a.pipeline?.steps?.analyze?.status;
  return st === "done" || st === "error" ? "unfit" : "pending";
}
