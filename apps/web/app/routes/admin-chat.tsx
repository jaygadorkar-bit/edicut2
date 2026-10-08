import { useLoaderData, type LoaderFunctionArgs, type MetaFunction } from "react-router";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { ChatWorkspace } from "../components/ChatWorkspace";
import { requireChatActor } from "../lib/chat-access.server";
import { isMissingChatSchema, listChatRooms } from "../lib/chat.server";
import chatStyles from "../styles/chat.css?url";
export const links = () => [{ rel: "stylesheet", href: chatStyles }];
export const meta: MetaFunction = () => [{ title: "Chat rooms | EdiCut Admin" }, { name: "robots", content: "noindex,nofollow" }];
export const headers = () => ({ "Cache-Control": "no-store" });
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, actor } = await requireChatActor(request, context, true);
  try { return { actor, state: await listChatRooms(db, actor) }; }
  catch (error) { if (!isMissingChatSchema(error)) throw error; return { actor, state: { rooms: [], hasMore: false, page: 1, ready: false } }; }
}
export default function AdminChat() {
  const { actor, state } = useLoaderData<typeof loader>();
  return <ChatWorkspace actor={actor} initialState={state} renderShell={(content, navigationPanel) => <AdminPanelShell title="Chat rooms" activeTab="chat" account={{ name: actor.name, detail: "Administrator" }} navigationPanel={navigationPanel}>{content}</AdminPanelShell>} />;
}
