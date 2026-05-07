import { eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import { adminUsers } from "../schema.js";

export async function findAdminUserByEmail(db: DatabaseClient, email: string) {
  return db.query.adminUsers.findFirst({
    where: eq(adminUsers.email, email.toLowerCase()),
  });
}

export async function findAdminUserById(db: DatabaseClient, adminUserId: string) {
  return db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, adminUserId),
  });
}

