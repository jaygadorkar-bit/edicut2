import { asc, eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import { users } from "../schema.js";

export async function findUserByEmail(db: DatabaseClient, email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

export async function findUserById(db: DatabaseClient, userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function listUsersForAdmin(db: DatabaseClient) {
  return db.query.users.findMany({
    orderBy: [asc(users.createdAt)],
  });
}

export async function updateUserRole(db: DatabaseClient, userId: string, role: string) {
  const [user] = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning();

  return user;
}
