import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { users as usersTable } from "@edicut/db/schema";
import { getDbFromContext } from "../lib/db.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { formatUserRole, isUserRole, normalizeUserRole, USER_ROLES } from "../lib/admin-user-roles";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import { AdminPanelShell } from "../components/AdminPanelShell";

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

  if (!userId) {
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
    user,
  };
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context);
  const userId = getUserId(params);
  const url = new URL(request.url);
  const returnTo = safeAdminReturnTo(url.searchParams.get("returnTo"));

  if (!isAdminRole(adminUser.role)) {
    return { error: "Permission denied." };
  }

  const formData = await request.formData();
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

    if (!email || !isEmail(email)) {
      return { error: "Enter a valid email address." };
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

  if (intent === "reset-password") {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }

    if (password !== confirmPassword) {
      return { error: "Passwords do not match." };
    }

    await db
      .update(usersTable)
      .set({
        passwordHash: bcrypt.hashSync(password, 10),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return { success: "Password reset." };
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

  return { error: "Unknown action." };
}

export default function AdminUserRoute() {
  const { adminUser, canEdit, returnTo, user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const initials = (user.name?.[0] || user.email[0] || "U").toUpperCase();

  return (
    <AdminPanelShell
      title={user.name || user.email}
      activeTab="users"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
    >
      <div className="space-y-6">
        <Link to={returnTo} className="inline-flex items-center gap-2 text-xs font-black text-[#6d55e8] transition hover:text-[#5b44d3]">
          <span className="material-symbols-outlined text-[17px]">arrow_back</span>
          Back to accounts
        </Link>
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              {user.profileImageUrl ? (
                <img src={optimizeCloudinaryUrl(user.profileImageUrl)} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-slate-100" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 text-2xl font-black text-white ring-4 ring-slate-100">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{user.name || "Unnamed user"}</p>
                <p className="truncate text-sm font-bold text-slate-500">{user.email}</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="font-bold text-slate-500">Role</dt>
                <dd className="font-black">{isUserRole(user.role) ? formatUserRole(user.role) : `legacy ${formatUserRole(user.role)}`}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-bold text-slate-500">Status</dt>
                <dd className={`font-black ${user.active && !user.deletedAt ? "text-emerald-600" : "text-red-600"}`}>
                  {user.deletedAt ? "In trash" : user.active ? "Active" : "Disabled"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-bold text-slate-500">Joined</dt>
                <dd className="font-black">{new Date(user.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Security</h2>
            <Form method="post" className="mt-4 space-y-3">
              <input type="hidden" name="intent" value="reset-password" />
              <input
                name="password"
                type="password"
                minLength={8}
                placeholder="New password"
                disabled={!canEdit || isSubmitting}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-black disabled:bg-slate-50"
              />
              <input
                name="confirmPassword"
                type="password"
                minLength={8}
                placeholder="Confirm password"
                disabled={!canEdit || isSubmitting}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-black disabled:bg-slate-50"
              />
              <button disabled={!canEdit || isSubmitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-black text-white disabled:opacity-50">
                <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                Reset password
              </button>
            </Form>
          </section>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-black">Account details</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Edit identity, contact, profile image, access, and account status.</p>
          </div>

          {actionData?.error ? (
            <div className="mx-5 mt-5 rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{actionData.error}</div>
          ) : null}
          {actionData?.success ? (
            <div className="mx-5 mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{actionData.success}</div>
          ) : null}
          {!canEdit ? (
            <div className="mx-5 mt-5 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-bold text-amber-700">Only admins can edit account records.</div>
          ) : null}

          <Form method="post" encType="multipart/form-data" className="grid gap-5 p-5">
            <input type="hidden" name="intent" value="save-profile" />
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Full name" name="name" defaultValue={user.name || ""} disabled={!canEdit || isSubmitting} />
              <Field label="Email" name="email" type="email" required defaultValue={user.email} disabled={!canEdit || isSubmitting} />
              <Field label="Phone number" name="phone" defaultValue={user.phone || ""} disabled={!canEdit || isSubmitting} />
              <Field label="Country" name="country" defaultValue={user.country || ""} disabled={!canEdit || isSubmitting} />
              <div className="md:col-span-2">
                <Field label="Profile image URL" name="profileImageUrl" type="url" defaultValue={user.profileImageUrl || ""} disabled={!canEdit || isSubmitting} />
              </div>
              <label className="grid gap-2 text-sm font-black md:col-span-2">
                Upload profile picture
                <input
                  name="profileImageFile"
                  type="file"
                  accept="image/*"
                  disabled={!canEdit || isSubmitting}
                  className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-bold file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-black file:text-white disabled:bg-slate-50"
                />
              </label>
              <label className="grid gap-2 text-sm font-black">
                Role
                <select name="role" defaultValue={normalizeUserRole(user.role)} disabled={!canEdit || isSubmitting} className="h-12 rounded-lg border border-slate-200 bg-white px-3 font-bold outline-none focus:border-black disabled:bg-slate-50">
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {formatUserRole(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-12 items-center gap-3 self-end rounded-lg border border-slate-200 px-4 text-sm font-black">
                <input name="active" type="checkbox" defaultChecked={user.active} disabled={!canEdit || isSubmitting} className="h-4 w-4 accent-black" />
                Account active
              </label>
            </div>
            <div className="flex justify-end border-t border-slate-100 pt-5">
              <button disabled={!canEdit || isSubmitting} className="flex h-11 items-center gap-2 rounded-lg bg-black px-5 text-sm font-black text-white disabled:opacity-50">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {isSubmitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </Form>

          <div className="border-t border-slate-100 p-5">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Account lifecycle</h2>
            <div className="mt-4">
              {user.deletedAt ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="restore" />
                  <button disabled={!canEdit || isSubmitting} className="flex h-11 items-center gap-2 rounded-lg border border-emerald-200 px-4 text-sm font-black text-emerald-700 disabled:opacity-50">
                    <span className="material-symbols-outlined text-[18px]">restore_from_trash</span>
                    Restore account
                  </button>
                </Form>
              ) : (
                <Form method="post" onSubmit={(event) => !confirm("Move this account to trash?") && event.preventDefault()}>
                  <input type="hidden" name="intent" value="move-to-trash" />
                  <button disabled={!canEdit || isSubmitting} className="flex h-11 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-black text-red-600 disabled:opacity-50">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    Move to trash
                  </button>
                </Form>
              )}
            </div>
          </div>
        </section>
        </div>
      </div>
    </AdminPanelShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-black">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        disabled={disabled}
        className="h-12 rounded-lg border border-slate-200 px-3 font-bold outline-none focus:border-black disabled:bg-slate-50"
      />
    </label>
  );
}
