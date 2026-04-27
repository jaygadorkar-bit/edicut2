import { createNodeDb } from "./client.js";
import { users, projects } from "./schema.js";

async function main() {
  const db = createNodeDb(process.env);

  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@edicut.com",
      name: "Edicut Admin",
      role: "admin",
      active: true,
      passwordHash:
        "pbkdf2$100000$2lPboSfn+YV6fWJBMhLrGg==$3mdKJNcLuW3f6YwP6M5j1pM1M8r1uWm9QbOSYfkpF7Q=",
    })
    .onConflictDoNothing()
    .returning();

  const ownerId = admin?.id;

  if (!ownerId) {
    return;
  }

  await db
    .insert(projects)
    .values([
      {
        ownerId,
        slug: "brand-film-foundry",
        title: "Brand Film Foundry",
        category: "Commercial",
        summary: "A fast-moving campaign cut system designed for paid social, launch trailers, and broadcast downsizes.",
        status: "published",
        featured: true,
        sortOrder: 1,
      },
      {
        ownerId,
        slug: "wedding-story-atlas",
        title: "Wedding Story Atlas",
        category: "Wedding",
        summary: "A cinematic edit package focused on vows, speeches, and emotional pacing across multi-day coverage.",
        status: "published",
        featured: true,
        sortOrder: 2,
      },
    ])
    .onConflictDoNothing();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
