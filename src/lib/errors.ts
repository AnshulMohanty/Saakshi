/**
 * Thrown by a real provider method that isn't available yet (or isn't configured).
 * Unset the provider's env vars to fall back to its mock.
 */
export class NotConfiguredError extends Error {
  constructor(
    readonly provider: string,
    readonly method: string,
    detail = "The real implementation lands in Phase 8.",
  ) {
    super(`${provider}.${method}() is not available: ${detail} Unset its env vars to use the mock.`);
    this.name = "NotConfiguredError";
  }
}
