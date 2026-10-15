import { findUserById } from "@edicut/db/repositories/users";
import type { LoaderContext } from "../types";
import { getDbFromContext } from "./db.server";
import { requireAdminUser, requireUserId } from "./session.server";
import { chatSenderName, type ChatActor } from "./chat";

export async function requireChatActor(request: Request, context?: LoaderContext, admin = false) {
  const db = getDbFromContext(context ?? {});
  if (admin) {
    const user = await requireAdminUser(request, db, context);
    return { db, actor: { id: user.id, key: `admin:${user.id}`, name: chatSenderName("admin", user.name || user.email), role: "admin", admin: true } satisfies ChatActor };
  }
  const id = await requireUserId(request, context);
  const user = await findUserById(db, id);
  if (!user?.active || user.deletedAt) throw new Response("This account is unavailable.", { status: 403 });
  return { db, actor: { id: user.id, key: `user:${user.id}`, name: chatSenderName(user.role, user.name), role: user.role, admin: false } satisfies ChatActor };
}
