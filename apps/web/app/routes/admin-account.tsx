import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { adminUsers } from "@edicut/db/schema";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { getDbFromContext } from "../lib/db.server";
import { requireAdminUser } from "../lib/session.server";
import { verifyPassword } from "../lib/password.server";
import { AdminPanelShell } from "../components/AdminPanelShell";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data?.adminUser ? "Admin account - EdiCut" : "Admin account" },
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

function readOptionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function safeAdminReturnTo(value: string | null) {
  if (!value || !value.startsWith(ADMIN_BASE_PATH) || value.startsWith(ADMIN_LOGIN_PATH) || value.includes("//")) {
    return ADMIN_BASE_PATH;
  }

  return value;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const url = new URL(request.url);
  const adminUser = await requireAdminUser(request, db, context, `${url.pathname}${url.search}`);
  const returnTo = safeAdminReturnTo(url.searchParams.get("returnTo"));

  return { adminUser: toPublicAdminUser(adminUser), returnTo };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const returnTo = safeAdminReturnTo(String(formData.get("returnTo") ?? ""));

  if (intent === "save-profile") {
    const name = readOptionalText(formData, "name");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = readOptionalText(formData, "phone");

    if (!email || !isEmail(email)) {
      return { error: "Enter a valid email address." };
    }

    try {
      await db
        .update(adminUsers)
        .set({
          name,
          email,
          phone,
          updatedAt: new Date(),
        })
        .where(eq(adminUsers.id, adminUser.id));

      return redirect(returnTo);
    } catch (error: any) {
      if (error?.message?.includes("unique") || error?.code === "23505") {
        return { error: "Another admin already uses that email." };
      }

      console.error("Admin profile update error:", error);
      return { error: "Failed to update admin profile." };
    }
  }

  if (intent === "change-password") {
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!(await verifyPassword(currentPassword, adminUser.passwordHash))) {
      return { error: "Current password is incorrect." };
    }

    if (password.length < 12) {
      return { error: "New admin password must be at least 12 characters." };
    }

    if (password !== confirmPassword) {
      return { error: "New passwords do not match." };
    }

    await db
      .update(adminUsers)
      .set({
        passwordHash: bcrypt.hashSync(password, 12),
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, adminUser.id));

    return { success: "Admin password updated." };
  }

  return { error: "Unknown action." };
}

export default function AdminAccountRoute() {
  const { adminUser, returnTo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <AdminPanelShell
      title="Admin account"
      activeTab="settings"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
    >
      <div className="space-y-6">
        <Link to={returnTo} className="inline-flex items-center gap-2 text-xs font-black text-[#6d55e8] transition hover:text-[#5b44d3]">
          <span className="material-symbols-outlined text-[17px]">arrow_back</span>
          Back to admin panel
        </Link>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-black">Profile details</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Update the admin identity used for sign in and panel activity.</p>
          </div>

          {actionData?.error ? (
            <div className="mx-5 mt-5 rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{actionData.error}</div>
          ) : null}
          {actionData?.success ? (
            <div className="mx-5 mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{actionData.success}</div>
          ) : null}

          <Form method="post" className="grid gap-5 p-5">
            <input type="hidden" name="intent" value="save-profile" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Full name" name="name" defaultValue={adminUser.name || ""} disabled={isSubmitting} />
              <Field label="Admin email" name="email" type="email" required defaultValue={adminUser.email} disabled={isSubmitting} />
              <Field label="Phone number" name="phone" type="tel" defaultValue={adminUser.phone || ""} disabled={isSubmitting} />
              <label className="grid gap-2 text-sm font-black">
                Role
                <input
                  value="admin"
                  readOnly
                  className="h-12 rounded-lg border border-slate-200 bg-slate-50 px-3 font-bold text-slate-500 outline-none"
                />
              </label>
            </div>
            <div className="flex justify-end border-t border-slate-100 pt-5">
              <Link to={returnTo} className="mr-3 flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-5 text-sm font-black text-slate-700 ">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back
              </Link>
              <button disabled={isSubmitting} className="flex h-11 items-center gap-2 rounded-lg bg-black px-5 text-sm font-black text-white disabled:opacity-50">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {isSubmitting ? "Saving..." : "Save details"}
              </button>
            </div>
          </Form>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-black">Password</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Confirm your current password before changing it.</p>
          </div>

          <Form method="post" className="grid gap-4 p-5">
            <input type="hidden" name="intent" value="change-password" />
            <Field label="Current password" name="currentPassword" type="password" required defaultValue="" disabled={isSubmitting} />
            <Field label="New password" name="password" type="password" required defaultValue="" disabled={isSubmitting} minLength={12} />
            <Field label="Confirm new password" name="confirmPassword" type="password" required defaultValue="" disabled={isSubmitting} minLength={12} />
            <button disabled={isSubmitting} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">lock_reset</span>
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </Form>
        </aside>
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
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
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
        minLength={minLength}
        className="h-12 rounded-lg border border-slate-200 px-3 font-bold outline-none focus:border-black disabled:bg-slate-50"
      />
    </label>
  );
}
