import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import bcrypt from "bcryptjs";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { adminUsers as adminUsersTable, users as usersTable } from "@edicut/db/schema";
import { getDbFromContext } from "../lib/db.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { isUserRole } from "../lib/admin-user-roles";
import { AdminUserDetails } from "../components/AdminUserDetails";
import stylesheetUrl from "../styles/admin-user.css?url";
import { resetCreatorProfile } from "../lib/client-workspace.server";
import { deleteSupabaseUsersByEmail, updateSupabaseUserEmailByEmail, updateSupabaseUserPasswordByEmail } from "../integrations/supabase/client.server";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { isWorkspaceRecordId } from "../lib/workspace";

export function links() { return [{ rel: "stylesheet", href: stylesheetUrl }]; }

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data?.user ? `${data.user.email} - Admin - EdiCut` : "Edit account - Admin - EdiCut" },
    { name: "robots", content: "noindex,nofollow" },
  ];
};

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "same-origin",
  };
}

function getUserId(params: LoaderFunctionArgs["params"] | ActionFunctionArgs["params"]) {
  const userId = params.userId;

  if (!userId || !isWorkspaceRecordId(userId)) {
    throw new Response("User not found", { status: 404 });
  }

  return userId;
}

function readOptionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function safeAdminReturnTo(value: string | null) {
  if (!value || !value.startsWith(ADMIN_BASE_PATH) || value.startsWith(ADMIN_LOGIN_PATH) || value.includes("//")) {
    return adminPath("?tab=users");
  }

  return value;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const userId = getUserId(params);
  const url = new URL(request.url);
  const adminUser = await requireAdminUser(request, db, context, `${url.pathname}${url.search}`);
  const returnTo = safeAdminReturnTo(url.searchParams.get("returnTo"));
  const user = await db.query.users.findFirst({
    where: eq(usersTable.id, userId),
  });

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  return {
    adminUser: toPublicAdminUser(adminUser),
    canEdit: isAdminRole(adminUser.role),
    returnTo,
    user: toPublicAdminUser(user),
  };
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 2 * 1024 * 1024)) {
    return { error: "This admin account request is too large. Profile images are limited to 1 MB." };
  }

  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context);
  const userId = getUserId(params);
  const url = new URL(request.url);
  const returnTo = safeAdminReturnTo(url.searchParams.get("returnTo"));

  if (!isAdminRole(adminUser.role)) {
    return { error: "Permission denied." };
  }

  const actionLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "USER_ACTION_LIMITER",
    key: `admin:${adminUser.id}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (actionLimit !== "allowed") {
    return {
      error: actionLimit === "limited"
        ? "Several admin actions were submitted. Wait a minute and try again."
        : "Usage protection is temporarily unavailable. Please try again shortly.",
    };
  }

  const formData = await readMutationForm(request, 2 * 1024 * 1024);
  if (!formData) return { error: "Submit a valid account form. Profile images are limited to 1 MB." };
  const intent = String(formData.get("intent") ?? "");

  if (intent === "save-profile") {
    const name = readOptionalText(formData, "name");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = readOptionalText(formData, "phone");
    const country = readOptionalText(formData, "country");
    let profileImageUrl = readOptionalText(formData, "profileImageUrl");
    const profileImageFile = formData.get("profileImageFile");
    const role = String(formData.get("role") ?? "");
    const active = formData.get("active") === "on";

    if (!email || email.length > 254 || !isEmail(email)) {
      return { error: "Enter a valid email address." };
    }
    if (name && name.length > 120) return { error: "Names are limited to 120 characters." };
    if (phone && phone.length > 32) return { error: "Phone numbers are limited to 32 characters." };
    if (country && country.length > 120) return { error: "Country names are limited to 120 characters." };
    const maxProfileImageLength = profileImageUrl?.startsWith("data:image/") ? 1_400_000 : 2_048;
    if (profileImageUrl && profileImageUrl.length > maxProfileImageLength) {
      return { error: "Profile image data is too large. Upload an image no larger than 1 MB." };
    }

    if (!isUserRole(role)) {
      return { error: "Choose a valid role." };
    }

    if (profileImageFile instanceof File && profileImageFile.size > 0) {
      if (!profileImageFile.type.startsWith("image/")) {
        return { error: "Upload an image file for the profile picture." };
      }

      if (profileImageFile.size > 1_000_000) {
        return { error: "Profile picture must be 1 MB or smaller." };
      }

      profileImageUrl = `data:${profileImageFile.type};base64,${arrayBufferToBase64(await profileImageFile.arrayBuffer())}`;
    }

    try {
      const existingUser = await db.query.users.findFirst({
        columns: { email: true },
        where: eq(usersTable.id, userId),
      });
      if (!existingUser) return { error: "This account could not be found." };
      if (existingUser.email.trim().toLowerCase() !== email) {
        const duplicate = await db.query.users.findFirst({
          columns: { id: true },
          where: and(eq(usersTable.email, email), ne(usersTable.id, userId)),
        });
        if (duplicate) return { error: "Another account already uses that email." };
        await updateSupabaseUserEmailByEmail(context, existingUser.email, email, userId);
      }

      await db
        .update(usersTable)
        .set({
          name,
          email,
          phone,
          country,
          profileImageUrl,
          role,
          active,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));

      return { success: "Account updated." };
    } catch (error: any) {
      if (error?.message?.includes("unique") || error?.code === "23505") {
        return { error: "Another account already uses that email." };
      }

      console.error("Admin account update error:", error);
      return { error: "Failed to update account." };
    }
  }

  if (intent === "reset-creator-profile") {
    try {
      const reset = await resetCreatorProfile(db, userId);
      return reset
        ? { success: "Creator profile reset. The user can set it up again." }
        : { error: "This user does not have a saved creator profile." };
    } catch (error) {
      console.error("Admin creator profile reset error:", error);
      return { error: "Could not reset the creator profile. Please try again later." };
    }
  }

  if (intent === "reset-password") {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8 || password.length > 128) {
      return { error: "Password must be between 8 and 128 characters." };
    }

    if (password !== confirmPassword) {
      return { error: "Passwords do not match." };
    }

    try {
      const targetUser = await db.query.users.findFirst({
        columns: { email: true },
        where: eq(usersTable.id, userId),
      });
      if (!targetUser) return { error: "This account could not be found." };

      await updateSupabaseUserPasswordByEmail(context, targetUser.email, password, userId);
      await db
        .update(usersTable)
        .set({
          passwordHash: bcrypt.hashSync(password, 10),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));

      return { success: "Password reset." };
    } catch (error) {
      console.error("Admin user password reset error:", error);
      return { error: "Could not reset this account’s password. Check the authentication connection and try again." };
    }
  }

  if (intent === "move-to-trash") {
    await db
      .update(usersTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    return redirect(returnTo);
  }

  if (intent === "restore") {
    await db
      .update(usersTable)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    return { success: "Account restored." };
  }

  if (intent === "permanent-delete") {
    try {
      const target = await db.query.users.findFirst({
        columns: { email: true, deletedAt: true },
        where: eq(usersTable.id, userId),
      });
      if (!target?.deletedAt) return { error: "Only accounts in trash can be permanently deleted." };
      const matchingAdmin = await db.query.adminUsers.findFirst({
        columns: { id: true },
        where: eq(adminUsersTable.email, target.email.trim().toLowerCase()),
      });
      if (matchingAdmin) return { error: "This email is also used by an admin account. Change the admin email before permanently deleting this customer profile." };

      await deleteSupabaseUsersByEmail(context, [target.email]);
      const [deletedUser] = await db.delete(usersTable)
        .where(and(eq(usersTable.id, userId), isNotNull(usersTable.deletedAt)))
        .returning();
      if (!deletedUser) return { error: "Only accounts in trash can be permanently deleted." };
      return redirect(returnTo);
    } catch (error) {
      console.error("Admin account permanent delete error:", error);
      return { error: "Could not permanently delete this account. Its customer record remains in trash; refresh and retry after checking the authentication connection." };
    }
  }

  return { error: "Unknown action." };
}

export default function AdminUserRoute() {
  const { adminUser, canEdit, returnTo, user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return <AdminPanelShell title="Account details" activeTab="users" account={{ name: adminUser.name || "Admin", detail: adminUser.email }}>
    <AdminUserDetails user={user} canEdit={canEdit} returnTo={returnTo} result={actionData} busy={navigation.state !== "idle"} pendingIntent={navigation.formData?.get("intent")?.toString()} />
  </AdminPanelShell>;
}
