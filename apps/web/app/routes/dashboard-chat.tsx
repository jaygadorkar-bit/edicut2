import { useLoaderData, type LoaderFunctionArgs, type MetaFunction } from "react-router";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { ChatWorkspace } from "../components/ChatWorkspace";
import { requireChatActor } from "../lib/chat-access.server";
import { ensureClientChatRooms, isMissingChatSchema, listChatRooms } from "../lib/chat.server";
import { clientNavigation } from "../lib/client-workspace-navigation";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import { getAllowedDashboardFeatures } from "../lib/role-feature-access";
import chatStyles from "../styles/chat.css?url";
export const links = () => [{ rel: "stylesheet", href: chatStyles }];
export const meta: MetaFunction = () => [{ title: "Chat | EdiCut" }, { name: "robots", content: "noindex,nofollow" }];
export const headers = () => ({ "Cache-Control": "no-store" });
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, actor } = await requireChatActor(request, context);
  const features = getAllowedDashboardFeatures(actor.role, await getRoleFeatureAccessSettings(db, context));
  try { await ensureClientChatRooms(db, actor); return { actor, features, state: await listChatRooms(db, actor) }; }
  catch (error) { if (!isMissingChatSchema(error)) throw error; return { actor, features, state: { rooms: [], hasMore: false, page: 1, ready: false } }; }
}
export default function DashboardChat() {
  const { actor, features, state } = useLoaderData<typeof loader>();
  return <ChatWorkspace actor={actor} initialState={state} renderShell={(content, navigationPanel) => <WorkspaceShell title="Chat" navItems={clientNavigation(features)} account={{ name: actor.name, detail: actor.role === "project_manager" ? "Project manager" : actor.role === "customer_support" ? "Customer support" : "Client" }} mobileMenu navigationFeedback profileTo="/dashboard/profile" profileNavAtBottom settingsTo="/dashboard/settings" navigationPanel={navigationPanel}>
    {content}
  </WorkspaceShell>} />;
}
