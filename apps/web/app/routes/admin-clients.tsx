import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
  ShouldRevalidateFunction,
} from "react-router";
import { redirect, useLoaderData } from "react-router";
import { sql } from "drizzle-orm";
import { AdminClientsWorkspace } from "../components/admin/AdminClientsWorkspace";
import {
  clientFilters,
  loadClientDetail,
  loadClientDirectory,
  loadClientManagers,
} from "../lib/admin-clients.server";
import {
  assignClientProjectManager,
  importMissingClientProjectManagers,
} from "../lib/client-project-managers.server";
import { createChatStore } from "../lib/chat-store.server";
import { notifyChatAccessChange } from "../lib/chat-realtime.server";
import type { ChatActor } from "../lib/chat";
import { getDbFromContext } from "../lib/db.server";
import { requireAdminUser } from "../lib/session.server";
import { toPublicAdminUser } from "../lib/admin-public";
import {
  loadReviewEditorOptions,
  mutateProjectReview,
  reviewRows,
} from "../lib/project-review.server";
import { isWorkspaceRecordId } from "../lib/workspace";
import {
  forbiddenMutation,
  isSameSiteMutation,
  readMutationForm,
} from "../lib/mutation-request.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";
import { loadAdminOrders, mutateAdminOrder } from "../lib/admin-orders.server";
import { adminPath } from "../lib/admin-paths";
import stylesheet from "../styles/admin-clients.css?url";

export const links = () => [{ rel: "stylesheet", href: stylesheet }];
export const meta: MetaFunction = () => [
  { title: "Clients | EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];
export const headers = () => ({
  "Cache-Control": "no-store",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
});
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => {
  if (
    !formMethod &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.searchParams.get("section") !== "orders" &&
    nextUrl.searchParams.get("section") !== "orders" &&
    currentUrl.searchParams.get("section") !==
      nextUrl.searchParams.get("section")
  ) {
    const current = new URLSearchParams(currentUrl.search),
      next = new URLSearchParams(nextUrl.search);
    current.delete("section");
    next.delete("section");
    current.sort();
    next.sort();
    if (current.toString() === next.toString()) return false;
  }
  return defaultShouldRevalidate;
};
const adminActor = (admin: { id: string; name: string | null }): ChatActor => ({
  id: admin.id,
  key: `admin:${admin.id}`,
  name: admin.name || "Admin",
  role: "admin",
  admin: true,
});

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(
    request,
    db,
    context,
    new URL(request.url).pathname + new URL(request.url).search,
  );
  const actor = adminActor(admin);
  let chat: ReturnType<typeof createChatStore> | undefined;
  const params = new URL(request.url).searchParams,
    filters = clientFilters(params);
  if (params.get("view") === "orders") {
    params.delete("view");
    const query = params.toString();
    throw redirect(`${adminPath("/orders")}${query ? `?${query}` : ""}`);
  }
  const requested = params.get("client");
  if (requested && !isWorkspaceRecordId(requested))
    throw new Response("Client not found.", { status: 404 });
  let chatUnavailable = false;
  try {
    chat = createChatStore(db, context);
    await importMissingClientProjectManagers(
      db,
      actor,
      await chat.listLegacyClientManagerAssignments(actor),
    );
  } catch {
    chatUnavailable = true;
  }
  const [directory, managers, editors] = await Promise.all([
    loadClientDirectory(db, filters),
    loadClientManagers(db),
    loadReviewEditorOptions(db),
  ]);
  const selectedId = requested || directory.clients[0]?.id;
  const detail = selectedId
    ? await loadClientDetail(db, selectedId, params)
    : null;
  if (requested && !detail)
    throw new Response("Client not found.", { status: 404 });
  let conversations: Awaited<
    ReturnType<ReturnType<typeof createChatStore>["listClientChatRooms"]>
  > = { rooms: [], hasMore: false };
  if (detail && chat) {
    try {
      conversations = await chat.listClientChatRooms(actor, detail.client.id);
    } catch {
      chatUnavailable = true;
    }
  }
  return {
    admin: toPublicAdminUser(admin),
    directory,
    detail,
    filters,
    managers,
    editors,
    conversations,
    chatUnavailable,
    orders:
      detail && params.get("section") === "orders"
        ? await loadAdminOrders(db, request, detail.client.id)
        : null,
    generatedAt: new Date().toISOString(),
  };
}

export type ClientActionResult = {
  success?: string;
  error?: string;
  warning?: string;
};
export async function action({
  request,
  context,
}: ActionFunctionArgs): Promise<ClientActionResult | Response> {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  const db = getDbFromContext(context),
    admin = await requireAdminUser(request, db, context),
    actor = adminActor(admin);
  const limit = await consumeUsageLimit({
    request,
    context,
    bindingName: "USER_ACTION_LIMITER",
    key: `admin:${admin.id}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (limit !== "allowed")
    return {
      error: "Please wait a minute before changing another assignment.",
    };
  const form = await readMutationForm(request, 4096);
  if (!form) return { error: "Submit a valid assignment form under 4 KB." };
  const clientId = String(form.get("clientId") || ""),
    intent = String(form.get("intent") || "");
  if (["mark-paid", "mark-unpaid", "delete-purchase"].includes(intent))
    return mutateAdminOrder(db, context, admin, form);
  if (!isWorkspaceRecordId(clientId))
    return { error: "Choose a client from the directory." };
  const client = reviewRows<{ active: boolean; paid: boolean }>(
    await db.execute(sql`SELECT u.active,
    EXISTS(SELECT 1 FROM customer_subscriptions s WHERE s.owner_id=u.id AND s.status='paid' AND s.deleted_at IS NULL) paid
    FROM users u WHERE u.id=${clientId}::uuid AND u.role IN ('user','customer') AND u.deleted_at IS NULL`),
  )[0];
  if (!client)
    return {
      error: "This client is no longer available. Refresh the directory.",
    };
  try {
    if (intent === "assign-manager") {
      const managerId = String(form.get("managerId") || "") || null;
      const expected = String(form.get("expectedManagerId") || "") || null;
      if (
        (managerId && !isWorkspaceRecordId(managerId)) ||
        (expected && !isWorkspaceRecordId(expected))
      )
        return { error: "Choose an active manager from the list." };
      await assignClientProjectManager(
        db,
        actor,
        clientId,
        managerId,
        expected,
      );
      let warning: string | undefined;
      if (client.active && client.paid) {
        try {
          const chat = createChatStore(db, context),
            rooms = await chat.createChatRoomsForClient(actor, clientId);
          if (rooms[0])
            await chat.assignChatManager(actor, rooms[0].id, managerId);
        } catch {
          warning =
            "The assignment is saved. Its chat activity notice could not be synced; refresh the conversation later.";
        }
      }
      await notifyChatAccessChange(db, context, {
        userIds: [clientId, managerId, expected].filter((id): id is string =>
          Boolean(id),
        ),
      });
      return {
        success: managerId
          ? "Manager assigned. Their project access now follows this client."
          : "Manager removed. Their access to this client's projects has been removed.",
        warning,
      };
    }
    if (intent === "assign-project-editor") {
      const projectId = String(form.get("projectId") || ""),
        editorId = String(form.get("userId") || "");
      if (!client.active)
        return {
          error:
            "Activate this client's account in Role manager before assigning an editor.",
        };
      if (!isWorkspaceRecordId(projectId) || !isWorkspaceRecordId(editorId))
        return { error: "Choose a project and an active editor." };
      const owned = reviewRows(
        await db.execute(
          sql`SELECT id FROM workspace_projects WHERE id=${projectId}::uuid AND owner_id=${clientId}::uuid`,
        ),
      );
      if (!owned.length)
        return {
          error: "This project does not belong to the selected client.",
        };
      form.set("intent", "set-editor");
      return await mutateProjectReview(db, actor, projectId, form);
    }
    return { error: "Choose a supported client action." };
  } catch (error) {
    if (
      error instanceof Response &&
      [400, 403, 404, 409].includes(error.status)
    )
      return { error: await error.text() };
    console.warn("Client assignment could not be saved.");
    return {
      error: "The assignment could not be saved. Refresh and try again.",
    };
  }
}

export default function AdminClientsRoute() {
  return <AdminClientsWorkspace data={useLoaderData<typeof loader>()} />;
}
