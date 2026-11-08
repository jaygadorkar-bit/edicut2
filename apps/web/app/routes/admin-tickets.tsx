import { useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { AdminPanelShell } from '../components/AdminPanelShell';
import { ChatWorkspace } from '../components/ChatWorkspace';
import { requireChatActor } from '../lib/chat-access.server';
import { createChatStore, isMissingChatSchema } from '../lib/chat-store.server';
import { chatId } from '../lib/chat';
import chatStyles from '../styles/chat.css?url';
export const links = () => [{ rel: 'stylesheet', href: chatStyles }];
export const meta: MetaFunction = () => [{ title: 'Support tickets | EdiCut Admin' }, { name: 'robots', content: 'noindex,nofollow' }];
export const headers = () => ({ 'Cache-Control': 'no-store' });
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, actor } = await requireChatActor(request, context, true);
  const chat = createChatStore(db, context);
  try {
    const requested=new URL(request.url).searchParams.get('room');
    if(requested&&!chatId(requested))throw new Response('Ticket not found.',{status:404});
    const state=await chat.listChatRooms(actor,1,'','all','tickets');
    if(requested){const room=await chat.getChatRoom(actor,requested);if(room.kind!=='support')throw new Response('Ticket not found.',{status:404});state.rooms=[room,...state.rooms.filter(item=>item.id!==room.id)];}
    return {actor,state,requested};
  }
  catch (error) { if (!isMissingChatSchema(error)) throw error; return { actor, state: { rooms: [], hasMore: false, page: 1, ready: false }, requested:null }; }
}
export default function AdminTickets() {
  const { actor, state, requested } = useLoaderData<typeof loader>();
  return <ChatWorkspace key={requested || 'all'} actor={actor} initialState={state} view="tickets" renderShell={(content, navigationPanel) => <AdminPanelShell title="Support tickets" activeTab="tickets" account={{ name: actor.name, detail: 'Administrator' }} conversationTo="/site/node-logmin/tickets" navigationPanel={navigationPanel}>{content}</AdminPanelShell>} />;
}
