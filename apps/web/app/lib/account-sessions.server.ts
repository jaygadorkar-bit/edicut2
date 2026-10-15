import type { DatabaseClient } from "@edicut/db/client";
import { adminUsers, users } from "@edicut/db/schema";
import { sql } from "drizzle-orm";

/** Credential changes revoke both stores for a provider identity shared by email. */
export async function invalidateAccountSessionsByEmail(db: DatabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  await db.execute(sql`WITH customer_revocations AS (
    UPDATE ${users} SET session_version = ${crypto.randomUUID()}
    WHERE lower(trim(${users.email})) = ${normalized} RETURNING ${users.id}
  ), admin_revocations AS (
    UPDATE ${adminUsers} SET session_version = ${crypto.randomUUID()}
    WHERE lower(trim(${adminUsers.email})) = ${normalized} RETURNING ${adminUsers.id}
  ) SELECT (SELECT count(*) FROM customer_revocations) AS customers,
    (SELECT count(*) FROM admin_revocations) AS admins`);
}
