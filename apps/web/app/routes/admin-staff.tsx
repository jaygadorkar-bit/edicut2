import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useActionData, useLoaderData, useNavigation } from "react-router";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { adminUsers } from "@edicut/db/schema";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { AdminUserDetails } from "../components/AdminUserDetails";
import { getDbFromContext } from "../lib/db.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { getAdminProfileImage } from "../lib/admin-profile.server";
import { requireAdminUser, isAdminRole } from "../lib/session.server";
import { isWorkspaceRecordId } from "../lib/workspace";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { updateSupabaseUserEmailByEmail, updateSupabaseUserPasswordByEmail } from "../integrations/supabase/client.server";
import stylesheetUrl from "../styles/admin-user.css?url";

export function links() { return [{ rel: "stylesheet", href: stylesheetUrl }]; }
export const meta: MetaFunction = () => [{ title: "Admin account details - EdiCut" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "same-origin" }; }
function recordId(params: LoaderFunctionArgs["params"]) {
  if (!params.adminId || !isWorkspaceRecordId(params.adminId)) throw new Response("Admin not found", { status: 404 });
  return params.adminId;
}
function returnPath(value: string | null) {
  return value?.startsWith(ADMIN_BASE_PATH) && !value.startsWith(ADMIN_LOGIN_PATH) && !value.includes("//") ? value : adminPath("?tab=users&view=admins");
}
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const id = recordId(params);
  const url = new URL(request.url);
  const actor = await requireAdminUser(request, db, context, `${url.pathname}${url.search}`);
  if (!isAdminRole(actor.role)) throw new Response("Permission denied", { status: 403 });
  const target = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, id) });
  if (!target) throw new Response("Admin not found", { status: 404 });
  const profile = await getAdminProfileImage(db, id);
  return { actor: toPublicAdminUser(actor), target: { ...toPublicAdminUser(target), country: null, profileImageUrl: profile?.imageUrl ?? null, deletedAt: null }, returnTo: returnPath(url.searchParams.get("returnTo")) };
}
export async function action({ request, context, params }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 64 * 1024)) return { error: "This admin account request is too large." };
  const id = recordId(params);
  const db = getDbFromContext(context);
  const actor = await requireAdminUser(request, db, context);
  if (!isAdminRole(actor.role)) return { error: "Permission denied." };
  const limit = await consumeUsageLimit({ context, request, bindingName: "USER_ACTION_LIMITER", key: `admin:${actor.id}`, localLimit: 60, localPeriodSeconds: 60 });
  if (limit !== "allowed") return { error: "Admin actions are temporarily limited. Try again shortly." };
  const form = await readMutationForm(request, 64 * 1024);
  if (!form) return { error: "Submit a valid account form under 64 KB." };
  const target = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, id) });
  if (!target) throw new Response("Admin not found", { status: 404 });
  const intent = String(form.get("intent") ?? "");
  if (intent === "save-profile") {
    const name = String(form.get("name") ?? "").trim() || null;
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const phone = String(form.get("phone") ?? "").trim() || null;
    const active = form.get("active") === "on";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid admin email address." };
    if ((name?.length ?? 0) > 120 || (phone?.length ?? 0) > 32) return { error: "Name and phone details are too long." };
    if (id === actor.id && !active) return { error: "You cannot disable the admin account you are using." };
    try {
      if (email !== target.email.trim().toLowerCase()) {
        const duplicate = await db.query.adminUsers.findFirst({ columns: { id: true }, where: and(eq(adminUsers.email, email), ne(adminUsers.id, id)) });
        if (duplicate) return { error: "Another admin already uses that email." };
        await updateSupabaseUserEmailByEmail(context, target.email, email);
      }
      await db.update(adminUsers).set({ name, email, phone, active, updatedAt: new Date() }).where(eq(adminUsers.id, id));
      return { success: "Admin account updated." };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return { error: "Another admin already uses that email." };
      console.error("Admin directory profile update failed");
      return { error: "Could not update this admin account. Check the authentication connection and try again." };
    }
  }
  if (intent === "reset-password") {
    if (id === actor.id) return { error: "Change your own password in account settings using your current password." };
    const password = String(form.get("password") ?? "");
    if (password.length < 12 || password.length > 128) return { error: "Admin password must be between 12 and 128 characters." };
    if (password !== String(form.get("confirmPassword") ?? "")) return { error: "Passwords do not match." };
    try {
      await updateSupabaseUserPasswordByEmail(context, target.email, password);
      await db.update(adminUsers).set({ passwordHash: bcrypt.hashSync(password, 12), updatedAt: new Date() }).where(eq(adminUsers.id, id));
      return { success: "Admin password reset." };
    } catch {
      console.error("Admin directory password reset failed");
      return { error: "Could not reset the password. Check the authentication connection and try again." };
    }
  }
  return { error: "Unknown action." };
}
export default function AdminStaffRoute() {
  const { actor, target, returnTo } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  return <AdminPanelShell title="Admin account details" activeTab="users" account={{ name: actor.name || "Admin", detail: actor.email }}>
    <AdminUserDetails user={target} canEdit returnTo={returnTo} adminAccount={{ self: actor.id === target.id }} result={result} busy={navigation.state !== "idle"} pendingIntent={navigation.formData?.get("intent")?.toString()} />
  </AdminPanelShell>;
}
