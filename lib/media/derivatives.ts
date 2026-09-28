/**
 * The standard face-blurred derivatives (pure). One place, so the library, measurement and the
 * Cloudinary eager list (CLD_EAGER=1) use the same transforms.
 */
import { frameOf } from "./composite";
import type { Transform } from "./transform";

export const THUMB: Transform = [{ crop: "fill", gravity: "auto", width: 480, height: 360 }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
export const PREVIEW: Transform = [{ width: 1280, crop: "limit" }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
/** The same-frame crop both photos of a pair (and their masks) use. */
export const FRAME = frameOf(800, 600);
/** The face-blurred, same-frame view of a photo (what the slider shows, aligned with its mask). */
export const VIEW: Transform = [...FRAME, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
