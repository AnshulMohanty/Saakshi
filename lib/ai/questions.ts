import type { ModerationQuestion } from "../providers/analysis";

/** Yes/no moderation questions asked of every photo. Answers feed the Trust Engine (lib/trust). */
export const MODERATION_QUESTIONS: ModerationQuestion[] = [
  { id: "watermark_or_stock", text: "Is there a visible watermark or stock-photo branding?" },
  { id: "screen_or_print", text: "Is this a photo of a screen, or of a printed photo?" },
  { id: "composited_or_generated", text: "Does the image look digitally composited or AI-generated?" },
  { id: "children_faces", text: "Are children's faces clearly visible?" },
];
