/**
 * The featured demo project. Configurable (DEMO_HERO=<project slug>) because the hero shouldn't
 * be picked on mock numbers: the final choice happens after real masks.
 */
import { eq } from "drizzle-orm";
import { getConfig } from "../config";
import type { DB } from "../db/client";
import { projects } from "../db/schema";

export const heroSlug = (): string => getConfig().env.DEMO_HERO;

/** The hero project, or null (with the slug that was asked for) if it doesn't exist. */
export async function heroProject(db: DB): Promise<{ slug: string; project: { id: string; name: string; slug: string | null } | null }> {
  const slug = heroSlug();
  const [p] = await db.select({ id: projects.id, name: projects.name, slug: projects.slug }).from(projects).where(eq(projects.slug, slug)).limit(1);
  return { slug, project: p ?? null };
}
