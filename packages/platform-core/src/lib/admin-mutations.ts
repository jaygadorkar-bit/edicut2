import { auth } from "../auth";
import { db } from "../db";
import { packages, portfolio, users } from "../db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { updateSecuritySetting } from "./security-settings";

export type AppRole = "customer" | "affiliate" | "editor" | "project_manager" | "admin";

export type ActionResult = { success: true } | { success: false; error: string };

export type PackageInput = {
  name: string;
  description?: string | null;
  tier: string;
  price: string;
  features?: string[] | null;
  maxRawFootageGB?: number | null;
  maxVideoLengthMin?: number | null;
  revisions?: number | null;
  deliveryDays?: number | null;
  isActive?: boolean;
};

export type PortfolioInput = {
  title: string;
  description?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  category?: string | null;
  clientName?: string | null;
  isFeatured?: boolean;
};

export async function requireAdminSession() {
  const session = await auth();

  if (!session?.user?.id || (session.user as { role?: string }).role !== "admin") {
    return null;
  }

  return session;
}

async function validateDeletionRequest(userIds: string[], sessionUserId?: string) {
  if (!userIds.length) {
    return { success: false as const, error: "Select at least one user." };
  }

  if (sessionUserId && userIds.includes(sessionUserId)) {
    return { success: false as const, error: "You cannot delete your own account." };
  }

  const targetUsers = await db
    .select({
      id: users.id,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  if (!targetUsers.length) {
    return { success: false as const, error: "No matching users were found." };
  }

  const adminIds = targetUsers
    .filter((user) => user.role === "admin")
    .map((user) => user.id);

  if (adminIds.length > 0) {
    const [adminCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "admin"));

    if (adminCount.count - adminIds.length <= 0) {
      return { success: false as const, error: "You cannot delete the last administrator." };
    }
  }

  return { success: true as const };
}

function buildPackagePayload(data: PackageInput) {
  return {
    ...data,
    description: data.description ?? null,
    features: data.features ?? [],
    maxRawFootageGB: data.maxRawFootageGB ?? null,
    maxVideoLengthMin: data.maxVideoLengthMin ?? null,
    revisions: data.revisions ?? 2,
    deliveryDays: data.deliveryDays ?? 7,
    isActive: data.isActive ?? true,
  };
}

function buildPortfolioPayload(data: PortfolioInput) {
  return {
    ...data,
    description: data.description ?? null,
    thumbnailUrl: data.thumbnailUrl ?? null,
    category: data.category ?? null,
    clientName: data.clientName ?? null,
    isFeatured: data.isFeatured ?? false,
  };
}

export async function createUserMutation(data: { name: string; email: string; role: AppRole }): Promise<ActionResult> {
  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    });

    if (existingUser) {
      return { success: false, error: "A user with this email already exists." };
    }

    await db.insert(users).values({
      name: data.name,
      email: data.email,
      role: data.role,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to create user:", error);
    return { success: false, error: "An unexpected error occurred while creating the user." };
  }
}

export async function updateUserRoleMutation(userId: string, role: AppRole): Promise<ActionResult> {
  try {
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
    return { success: true };
  } catch (error) {
    console.error("Failed to update user role:", error);
    return { success: false, error: "Failed to update role" };
  }
}

export async function bulkUpdateUserRolesMutation(userIds: string[], role: AppRole): Promise<ActionResult> {
  try {
    if (!userIds.length) {
      return { success: false, error: "Select at least one user." };
    }

    await db.update(users).set({ role, updatedAt: new Date() }).where(inArray(users.id, userIds));
    return { success: true };
  } catch (error) {
    console.error("Failed to bulk update user roles:", error);
    return { success: false, error: "Failed to update selected users." };
  }
}

export async function deleteUserMutation(userId: string, sessionUserId?: string): Promise<ActionResult> {
  try {
    const validation = await validateDeletionRequest([userId], sessionUserId);
    if (!validation.success) {
      return validation;
    }

    await db.delete(users).where(eq(users.id, userId));
    return { success: true };
  } catch (error) {
    console.error("Failed to delete user:", error);
    return { success: false, error: "Failed to delete user." };
  }
}

export async function bulkDeleteUsersMutation(userIds: string[], sessionUserId?: string): Promise<ActionResult> {
  try {
    const validation = await validateDeletionRequest(userIds, sessionUserId);
    if (!validation.success) {
      return validation;
    }

    await db.delete(users).where(inArray(users.id, userIds));
    return { success: true };
  } catch (error) {
    console.error("Failed to bulk delete users:", error);
    return { success: false, error: "Failed to delete selected users." };
  }
}

export async function createPackageMutation(data: PackageInput): Promise<ActionResult> {
  try {
    const slug = data.name.toLowerCase().replace(/ /g, "-").replace(/[^\w-]+/g, "");

    await db.insert(packages).values({
      ...buildPackagePayload(data),
      slug,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to create package:", error);
    return { success: false, error: "An error occurred while creating the package." };
  }
}

export async function updatePackageMutation(id: string, data: PackageInput): Promise<ActionResult> {
  try {
    const slug = data.name.toLowerCase().replace(/ /g, "-").replace(/[^\w-]+/g, "");

    await db
      .update(packages)
      .set({ ...buildPackagePayload(data), slug, updatedAt: new Date() })
      .where(eq(packages.id, id));

    return { success: true };
  } catch (error) {
    console.error("Failed to update package:", error);
    return { success: false, error: "An error occurred while updating the package." };
  }
}

export async function createPortfolioItemMutation(data: PortfolioInput): Promise<ActionResult> {
  try {
    await db.insert(portfolio).values({
      ...buildPortfolioPayload(data),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to create portfolio item:", error);
    return { success: false, error: "Failed to create item." };
  }
}

export async function updatePortfolioItemMutation(id: string, data: PortfolioInput): Promise<ActionResult> {
  try {
    await db
      .update(portfolio)
      .set({ ...buildPortfolioPayload(data), updatedAt: new Date() })
      .where(eq(portfolio.id, id));

    return { success: true };
  } catch (error) {
    console.error("Failed to update portfolio item:", error);
    return { success: false, error: "Failed to update item." };
  }
}

export async function deletePortfolioItemMutation(id: string): Promise<ActionResult> {
  try {
    await db.delete(portfolio).where(eq(portfolio.id, id));
    return { success: true };
  } catch (error) {
    console.error("Failed to delete portfolio item:", error);
    return { success: false, error: "Failed to delete item." };
  }
}

export async function updateSecuritySettingMutation(key: string, value: unknown): Promise<ActionResult> {
  try {
    await updateSecuritySetting(key, value);
    return { success: true };
  } catch (error) {
    console.error(`Error updating security setting ${key}:`, error);
    return { success: false, error: "Failed to update security setting." };
  }
}
