import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import {
  isSameSiteMutation,
  readSubscriptionForm,
} from "../lib/customer-subscriptions.server";
import {
  consumeUsageLimit,
  requestBodyExceedsLimit,
} from "../lib/usage-protection.server";
import { mutateAdminOrder } from "../lib/admin-orders.server";
import { adminPath } from "../lib/admin-paths";
import { isWorkspaceRecordId } from "../lib/workspace";

export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}
async function adminAccess(
  request: Request,
  context: LoaderFunctionArgs["context"],
) {
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context);
  if (!admin.active || !isAdminRole(admin.role))
    throw new Response("Permission denied", { status: 403 });
  return { db, admin };
}
/** Keep existing order bookmarks working after Orders gets its own workspace page. */
export async function loader({ request, context }: LoaderFunctionArgs) {
  await adminAccess(request, context);
  const params = new URLSearchParams(new URL(request.url).search);
  const event = params.get("event");
  if (event && !isWorkspaceRecordId(event))
    throw new Response("Order not found.", { status: 404 });
  const query = params.toString();
  return redirect(`${adminPath("/orders")}${query ? `?${query}` : ""}`);
}
/** Compatibility endpoint for order forms opened before the workspace was merged. */
export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request))
    return { error: "Please submit changes from this site." };
  if (requestBodyExceedsLimit(request, 4096))
    return { error: "This request is too large." };
  const { db, admin } = await adminAccess(request, context);
  const limit = await consumeUsageLimit({
    request,
    context,
    bindingName: "USER_ACTION_LIMITER",
    key: `admin:${admin.id}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (limit !== "allowed")
    return { error: "Please wait a minute and try again." };
  const form = await readSubscriptionForm(request, 4096);
  if (!form) return { error: "Submit a valid order record form under 4 KB." };
  return mutateAdminOrder(db, context, admin, form);
}
