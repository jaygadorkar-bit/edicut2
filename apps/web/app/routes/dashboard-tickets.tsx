import { redirect, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { ChatWorkspace } from '../components/ChatWorkspace';
import { requireChatActor } from '../lib/chat-access.server';
import { createChatStore, isMissingChatSchema } from '../lib/chat-store.server';
import { clientNavigation } from '../lib/client-workspace-navigation';
import { getRoleFeatureAccessSettings } from '../lib/site-settings.server';
import { getAllowedDashboardFeatures } from '../lib/role-feature-access';
import chatStyles from '../styles/chat.css?url';
export const links = () => [{ rel: 'stylesheet', href: chatStyles }];
export const meta: MetaFunction = () => [{ title: 'Support tickets | EdiCut' }, { name: 'robots', content: 'noindex,nofollow' }];
export const headers = () => ({ 'Cache-Control': 'no-store' });
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, actor } = await requireChatActor(request, context);
  if (actor.role === 'project_manager') throw redirect('/dashboard/chat');
  const chat = createChatStore(db, context);
  const features = getAllowedDashboardFeatures(actor.role, await getRoleFeatureAccessSettings(db, context));
  try { return { actor, features, state: await chat.listChatRooms(actor, 1, '', 'all', 'tickets') }; }
  catch (error) { if (!isMissingChatSchema(error)) throw error; return { actor, features, state: { rooms: [], hasMore: false, page: 1, ready: false } }; }
}
export default function DashboardTickets() {
  const { actor, features, state } = useLoaderData<typeof loader>();
  return <ChatWorkspace actor={actor} initialState={state} view="tickets" renderShell={(content, navigationPanel) => <WorkspaceShell title="Support tickets" navItems={[...clientNavigation(features), ...(actor.role === 'customer_support' ? [] : [{ label: 'Project chat', icon: 'chat', to: '/dashboard/chat' }]), { label: 'Support tickets', icon: 'confirmation_number', to: '/dashboard/tickets' }]} account={{ name: actor.name, detail: actor.role === 'customer_support' ? 'Customer support' : 'Client' }} mobileMenu navigationFeedback profileTo="/dashboard/profile" settingsTo="/dashboard/settings" chatTo="/dashboard/tickets" navigationPanel={navigationPanel}>{content}</WorkspaceShell>} />;
}
