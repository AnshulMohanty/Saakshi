/**
 * Park–Miller (landing_gl.js GL:9): the same seeds give the prototype's exact scatter. Its own
 * module so the Wall and the demo entry use it without loading three.js (landing-stage.ts).
 */
export const rng = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647;
