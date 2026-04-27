import { eq } from "drizzle-orm";
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
