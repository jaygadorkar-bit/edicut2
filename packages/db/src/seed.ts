import { createNodeDb } from "./client.js";
import { adminUsers, users, projects } from "./schema.js";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRootEnv() {
  const envPath = resolve(__dirname, "../../../.env");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadRootEnv();

function base64(buffer: Buffer) {
  return buffer.toString("base64");
}

function hashPassword(password: string) {
  const iterations = 100_000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");

  return `pbkdf2$${iterations}$${base64(salt)}$${base64(hash)}`;
}

async function main() {
  const db = createNodeDb(process.env);
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@edicut.com";
  const adminName = process.env.ADMIN_BOOTSTRAP_NAME || "Edicut Admin";
  const adminPhone = process.env.ADMIN_BOOTSTRAP_PHONE || null;
  const adminPasswordHash =
    process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH ||
    (process.env.ADMIN_BOOTSTRAP_PASSWORD ? hashPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD) : undefined) ||
    "pbkdf2$100000$2lPboSfn+YV6fWJBMhLrGg==$3mdKJNcLuW3f6YwP6M5j1pM1M8r1uWm9QbOSYfkpF7Q=";

  await db
    .insert(adminUsers)
    .values({
      email: adminEmail.toLowerCase(),
      name: adminName,
      phone: adminPhone,
      role: "admin",
      active: true,
      passwordHash: adminPasswordHash,
    })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: {
        name: adminName,
        phone: adminPhone,
        role: "admin",
        active: true,
        passwordHash: adminPasswordHash,
        updatedAt: new Date(),
      },
    });

  const [owner] = await db
    .insert(users)
    .values({
      email: "demo-owner@edicut.com",
      name: "Demo Owner",
      role: "customer",
      active: true,
      passwordHash:
        "pbkdf2$100000$2lPboSfn+YV6fWJBMhLrGg==$3mdKJNcLuW3f6YwP6M5j1pM1M8r1uWm9QbOSYfkpF7Q=",
    })
    .onConflictDoNothing()
    .returning();

  const ownerId = owner?.id;

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

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
