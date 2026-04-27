import { and, asc, desc, eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import { projects } from "../schema.js";
import type { ProjectInput } from "@edicut/shared/contracts/projects";

export async function listFeaturedProjects(db: DatabaseClient) {
  return db.query.projects.findMany({
    where: and(eq(projects.featured, true), eq(projects.status, "published")),
    orderBy: [asc(projects.sortOrder), desc(projects.createdAt)],
    limit: 3,
  });
}

export async function listPublishedProjects(db: DatabaseClient) {
  return db.query.projects.findMany({
    where: eq(projects.status, "published"),
    orderBy: [asc(projects.sortOrder), desc(projects.createdAt)],
  });
}

export async function listProjectsForOwner(db: DatabaseClient, ownerId: string) {
  return db.query.projects.findMany({
    where: eq(projects.ownerId, ownerId),
    orderBy: [asc(projects.sortOrder), desc(projects.createdAt)],
  });
}

export async function createProject(
  db: DatabaseClient,
  args: ProjectInput & { ownerId: string; slug: string }
) {
  const insertValues = {
    ownerId: args.ownerId,
    slug: args.slug,
    title: args.title,
    category: args.category,
    summary: args.summary,
  };

  const [project] = await db
    .insert(projects)
    .values(insertValues)
    .returning();

  if (args.status === "draft" && !args.featured) {
    return project;
  }

  const [updatedProject] = await db
    .update(projects)
    .set({
      status: args.status,
      featured: args.featured,
    })
    .where(eq(projects.id, project.id))
    .returning();

  return updatedProject;
}
