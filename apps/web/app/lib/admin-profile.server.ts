import { and, eq, isNull, sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { adminUsers, users } from "@edicut/db/schema";

/** Admin identities do not store photos; Google sign-in saves them on the matching user profile. */
export async function getAdminProfileImage(db: DatabaseClient, adminId: unknown) {
  if (typeof adminId !== "string" || !adminId) return null;
  const [profile] = await db.select({ email: adminUsers.email, imageUrl: users.profileImageUrl })
    .from(adminUsers)
    .innerJoin(users, sql`lower(${users.email}) = lower(${adminUsers.email})`)
    .where(and(eq(adminUsers.id, adminId), eq(adminUsers.active, true), eq(adminUsers.role, "admin"), isNull(users.deletedAt)))
    .limit(1);
  return profile?.imageUrl ? profile : null;
}
