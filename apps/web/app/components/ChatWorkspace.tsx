import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from 'react-router';
import { ArrowLeft, Check, CheckCheck, Headphones, LockKeyhole, MessageCircle, MoreHorizontal, Paperclip, Plus, Search, Send, Smile, Ticket, UserRound, Users, X } from "lucide-react";
import { canSendChatMessage, chatIsStaff, chatRoleLabel, chatRoomTitle, chatSenderName, formatChatLastActive, isChatParticipantRecentlyActive, mergeChatMessages, validateSupportTicket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, type ChatActor, type ChatHistory, type ChatMessage, type ChatParticipant, type ChatPerson, type ChatReceipt, type ChatRoom, type ChatSnapshot, type ChatState, type ChatView } from "../lib/chat";
import type { WorkspaceNavigationPanel } from "./WorkspaceShell";
import { refreshChatUnreadCounts } from "../lib/use-chat-unread-counts";
import { createChatRefreshQueue, useChatSocket, type ChatLiveEvent } from "../lib/chat-live";

class ChatRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
type VisibleChatMessage = ChatMessage & { deliveryState?: "sending" };
export function chatReadMessageId(messages: VisibleChatMessage[], unreadCount: number, previousId: string) {
  if (unreadCount <= 0) return null;
  const latest = messages.findLast(message => message.deliveryState !== "sending");
  return latest && latest.id !== previousId ? latest.id : null;
}
export function mergeVisibleChatMessages(current: VisibleChatMessage[], incoming: ChatMessage[]) {
  const incomingNonces = new Set(incoming.map(message => message.clientNonce));
  const confirmed = current.filter(message => message.deliveryState !== "sending");
  const pending = current.filter(message => message.deliveryState === "sending" && !incomingNonces.has(message.clientNonce));
  return [...mergeChatMessages(confirmed, incoming), ...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
async function chatRequest<T>(scope: string, operation: string, values: Record<string, string> = {}, form?: FormData, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ scope, operation, ...values });
  const response = await fetch(`/api/chat?${query}`, { method: form ? "POST" : "GET", body: form, signal: signal ?? AbortSignal.timeout(25_000), cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Your session needs refreshing. Reload this page to sign in again.");
  const result = await response.json() as T & { error?: string }; if (!response.ok) throw new ChatRequestError(result.error ?? "Chat could not be updated. Try again.", response.status);
  if (form && form.get("intent") !== "typing") refreshChatUnreadCounts(scope);
  return result as T;
}
const makeForm = (values: Record<string, string>) => { const form = new FormData(); for (const [key, value] of Object.entries(values)) form.set(key, value); return form; };
function Initials({ name, support = false }: { name: string; support?: boolean }) {
  return <span className={`chat-avatar ${support ? "chat-avatar--support" : ""}`} aria-hidden="true">{support ? <Headphones size={20} /> : name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || <UserRound size={20} />}</span>;
}
function ChatRoomParticipant({ participant, activeNow = false }: { participant: ChatParticipant; activeNow?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [participant.avatarUrl]);
  const initials = participant.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  const recentlyActive = activeNow || isChatParticipantRecentlyActive(participant.lastActiveAt);
  return <span className="chat-room-participant">
    <span className={`chat-room-participant-avatar ${recentlyActive ? "is-recent" : ""}`} aria-hidden="true">
      <span className="chat-room-participant-avatar-image">{participant.avatarUrl && !imageFailed ? <img src={participant.avatarUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : initials}</span>
      {recentlyActive ? <span className="chat-room-participant-dot" /> : null}
    </span>
    <span className="chat-room-participant-copy"><strong>{participant.name}</strong><small>{chatRoleLabel(participant.role)} · {activeNow ? "Active now" : formatChatLastActive(participant.lastActiveAt)}</small></span>
  </span>;
}
function MessageBody({ body }: { body: string }) {
  return <p>{body.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) => index % 2 ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part)}</p>;
}
function useDebounced(value: string) { const [settled, set] = useState(value); useEffect(() => { const timer = setTimeout(() => set(value), 300); return () => clearTimeout(timer); }, [value]); return settled; }
export function ChatWorkspace({ actor, initialState, view = 'projects', renderShell }: { actor: ChatActor; initialState: ChatState; view?: ChatView; renderShell: (content: ReactNode, navigation: WorkspaceNavigationPanel) => ReactNode }) {
  const scope = actor.admin ? "admin" : "client";
  const ticketView = view === 'tickets', staff = chatIsStaff(actor), location = useLocation();
  const [state, setState] = useState(initialState), [selected, setSelected] = useState<string | null>(initialState.rooms[0]?.id ?? null);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [error, setError] = useState("");
  const [typing, setTyping] = useState<{ roomId: string; name: string; expires: number } | null>(null);
  const [historySearch, setHistorySearch] = useState(""), [snapshot, setSnapshot] = useState<{ history: ChatHistory; search: string } | null>(null);
  const [showNew, setShowNew] = useState(ticketView && !staff && new URLSearchParams(location.search).get('new') === '1');
  const settledSearch = useDebounced(search); const draftRef = useRef(new Map<string, string>());
  const refreshQueue = useRef<ReturnType<typeof createChatRefreshQueue> | null>(null), refreshRequest = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const refreshRooms = useCallback(async (page = 1, append = false) => {
    if (!initialState.ready || document.visibilityState !== "visible" || !navigator.onLine) return;
    const generation = ++requestGeneration.current;
    refreshRequest.current?.abort(); const controller = new AbortController(); refreshRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const values = { page: String(page), search: settledSearch, filter, view, ...(selected ? { roomId: selected } : {}), messageSearch: historySearch };
      const result = append ? await chatRequest<ChatState>(scope, "rooms", values, undefined, controller.signal)
        : await chatRequest<ChatSnapshot>(scope, "sync", values, undefined, controller.signal);
      if (generation !== requestGeneration.current) return;
      const next = "state" in result ? result.state : result;
      setState(previous => ({ ...next, rooms: append ? [...previous.rooms.filter(room => !next.rooms.some(r => r.id === room.id)), ...next.rooms] : next.rooms })); setError("");
      if ("state" in result) {
        refreshChatUnreadCounts(scope, result.unread);
        setSnapshot(result.history ? { history: result.history, search: historySearch } : null);
        if (result.historyUnavailable) setSelected(null);
      }
    } catch (e) {
      if (generation !== requestGeneration.current) return;
      setError(controller.signal.aborted ? "The conversation took too long to load. Try refreshing it." : (e as Error).message);
      if (e instanceof ChatRequestError && (e.status === 401 || e.status === 403)) {
        setState({ rooms: [], ready: false, hasMore: false, page: 1 }); setSnapshot(null); setSelected(null);
        refreshChatUnreadCounts(scope, { projects: 0, tickets: 0 });
      }
    }
    finally { clearTimeout(timeout); if (refreshRequest.current === controller) refreshRequest.current = null; }
  }, [scope, initialState.ready, settledSearch, filter, view, selected, historySearch]);
  const previousRefresh = useRef(refreshRooms);
  const scheduleRefresh = useCallback(() => refreshQueue.current?.schedule(), []);
  useEffect(() => {
    const queue = createChatRefreshQueue(() => refreshRooms()); refreshQueue.current = queue;
    // Initial history comes from the socket-open refresh (or its HTTP fallback).
    // A changed room/filter/search still needs its own fresh request.
    if (previousRefresh.current !== refreshRooms) queue.schedule();
    previousRefresh.current = refreshRooms;
    const abortHiddenRequest = () => {
      if (document.visibilityState !== "visible") { ++requestGeneration.current; refreshRequest.current?.abort(); }
    };
    document.addEventListener("visibilitychange", abortHiddenRequest);
    return () => { queue.dispose(); ++requestGeneration.current; refreshRequest.current?.abort(); document.removeEventListener("visibilitychange", abortHiddenRequest); };
  }, [refreshRooms]);
  const onSocket = useCallback((event: ChatLiveEvent) => {
    if (event.type === "typing" && event.actorKey !== actor.key && event.roomId && event.name) { setTyping({ roomId: event.roomId, name: event.name, expires: Date.now() + 7000 }); return; }
    if (event.type === "typing") return;
    scheduleRefresh();
  }, [actor.key, scheduleRefresh]);
  const status = useChatSocket(scope, state.ready, onSocket, actor.key);
  useEffect(() => { if (!typing) return; const timer = setTimeout(() => setTyping(null), Math.max(0, typing.expires - Date.now())); return () => clearTimeout(timer); }, [typing]);
  const room = state.rooms.find(r => r.id === selected);
  const pickRoom = (id: string) => { if (id === selected) return; setSelected(id); setHistorySearch(""); setError(""); setTyping(null); };
  const navigationPanel: WorkspaceNavigationPanel = ({ collapsed, closeMenu, returnToMainMenu }) => <div className={`chat-navigation chat-workspace ${collapsed ? "chat-navigation--collapsed" : ""}`}>
      <button type="button" className="chat-main-menu" title={collapsed ? "Back to main menu" : undefined} onClick={returnToMainMenu}><ArrowLeft size={18} aria-hidden="true" /><span className={collapsed ? "sr-only" : ""}>Back to main menu</span></button>
      <div className="chat-rooms">
        <div className="chat-rooms-heading"><h2 className={collapsed ? "sr-only" : ""}>{ticketView ? staff ? 'Support queue' : 'Your tickets' : actor.admin ? "Client groups" : staff ? "Conversations" : "Your conversations"}</h2>{(ticketView ? !staff : actor.admin) && !collapsed ? <button className="chat-icon-button" title={ticketView ? 'Start a ticket' : 'Start a conversation'} aria-label={ticketView ? 'Start a ticket' : 'Start a conversation'} disabled={!state.ready} onClick={() => { closeMenu(); setShowNew(true); }}>{ticketView ? <Plus size={19} /> : <Users size={19} />}</button> : null}</div>
        {staff || ticketView ? <label className="chat-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label={ticketView ? 'Search tickets' : 'Search conversations'} placeholder={ticketView ? 'Search tickets' : 'Search conversations'} value={search} maxLength={120} onChange={e => { setSearch(e.target.value); }} /></label> : null}
        {ticketView && !collapsed ? <label className="ticket-filter"><span>Ticket status</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All tickets ({state.ticketCounts?.all ?? 0})</option><option value="open">Open tickets</option>{Object.entries(TICKET_STATUSES).map(([value, label]) => <option key={value} value={value}>{label} ({state.ticketCounts?.[value as keyof typeof TICKET_STATUSES] ?? 0})</option>)}</select></label> : null}
        <div className="chat-room-list">{state.rooms.map(item => {
          const groupParticipants = item.participants ?? [];
          const hasRecentActivity = groupParticipants.some(participant => actor.admin && participant.role === "admin" || isChatParticipantRecentlyActive(participant.lastActiveAt));
          return <button type="button" key={item.id} className={`chat-room ${item.kind === 'manager' ? 'chat-room--project' : ''} ${selected === item.id ? "is-selected" : ""} ${item.kind === 'manager' && !item.projectUnlocked ? 'is-locked' : ''}`} aria-pressed={selected === item.id} aria-label={collapsed ? `${chatRoomTitle(actor, item)}${item.unreadCount ? `, ${item.unreadCount} unread messages` : ""}` : undefined} title={collapsed ? chatRoomTitle(actor, item) : undefined} onClick={() => { pickRoom(item.id); closeMenu(); }}>
            {item.kind === 'manager' && item.projectUnlocked ? <>
              <span className="chat-room-project-collapsed-avatar"><Initials name={staff ? item.clientName : item.managerName ?? "Project manager"} /></span>
              <span className="chat-room-project-heading"><span className="chat-room-project-title">{chatRoomTitle(actor, item)}</span></span>
              {item.unreadCount > 0 ? <span className="chat-unread" aria-label={`${item.unreadCount} unread messages`}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : null}
              <span className="chat-room-member-count"><span className={`chat-room-member-dot ${hasRecentActivity ? "has-recent-activity" : ""}`} aria-hidden="true" />{groupParticipants.length} {groupParticipants.length === 1 ? "Member" : "Members"}</span>
              <span className="chat-room-participants" aria-label="Group participants">
                {groupParticipants.length ? groupParticipants.map(participant => <ChatRoomParticipant key={participant.key} participant={participant} activeNow={actor.admin && participant.role === "admin"} />) : <span className="chat-room-participants-empty">No other participants yet</span>}
                {!item.managerActive && !staff ? <span className="chat-room-pending">Manager pending</span> : null}
              </span>
            </> : <>
              <Initials name={staff ? item.clientName : item.managerName ?? "Project manager"} support={item.kind === "support" && !staff} />
              <span className="chat-room-copy">
                <span className="chat-room-heading"><span className="chat-room-title">{chatRoomTitle(actor, item)}</span>
                  {item.kind === 'manager' && !item.projectUnlocked ? <LockKeyhole size={14} aria-hidden="true" /> : null}
                  {item.unreadCount > 0 ? <span className="chat-unread" aria-label={`${item.unreadCount} unread messages`}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : null}
                </span>
                {item.kind === 'support' ? <span className="chat-room-label">{item.ticket ? `#${item.ticket.number} · ${TICKET_STATUSES[item.ticket.status]}` : 'Support ticket'}</span> : null}
              </span>
              {item.ticket && staff ? <span className="chat-room-detail">{item.clientName} · {TICKET_PRIORITIES[item.ticket.priority]} priority</span> : null}
              <span className="chat-room-preview"><span>{item.kind === 'manager' ? 'Available after a purchase' : item.lastMessagePreview ?? 'Start the conversation'}</span></span>
            </>}
          </button>;
        })}
          {!state.rooms.length ? <div className="chat-list-empty"><MessageCircle size={26} aria-hidden="true" /><p>{search || filter !== "all" ? "No conversations match." : ticketView ? 'No tickets yet.' : actor.role === "project_manager" ? "Your assigned clients will appear here." : actor.admin ? 'Customers with paid purchases appear here automatically.' : "No conversations yet."}</p></div> : null}
          {state.hasMore ? <button className="chat-text-button chat-load-more" onClick={() => void refreshRooms(state.page + 1, true)}>Load more conversations</button> : null}
        </div>
        {!staff ? <Link className="chat-support-entry" to={ticketView ? '/dashboard/chat' : '/dashboard/tickets?new=1'} onClick={closeMenu}>{ticketView ? <MessageCircle size={20} aria-hidden="true" /> : <Headphones size={20} aria-hidden="true" />}<span className={collapsed ? 'sr-only' : ''}><strong>{ticketView ? 'Project group' : 'Customer support'}</strong><small>{ticketView ? 'Chat with your project team' : 'Start a ticket'}</small></span></Link> : null}
      </div>
    </div>;
  const content = <div className={`chat-workspace ${ticketView ? 'chat-workspace--tickets' : actor.admin ? 'chat-workspace--admin' : !staff ? 'chat-workspace--client-project' : ''}`}>
    {ticketView || (staff && !actor.admin) ? <div className="chat-page-heading"><div><h2>{ticketView ? 'Support tickets' : "Team inbox"}</h2><p>{ticketView ? staff ? 'Help customers, follow up, and resolve issues.' : 'Tell us what’s happening. Our support team will help.' : 'Customers, admins, and the assigned project manager, together.'}</p></div>
      {ticketView && !staff ? <button type="button" className="chat-primary-button ticket-new-button" disabled={!state.ready} onClick={() => setShowNew(true)}><Plus size={17} aria-hidden="true" />Start a ticket</button> :
      <span className={`chat-connection ${status === "Live" ? "is-live" : ""}`} role="status"><span aria-hidden="true" />{status}</span>}</div> : null}
    {!state.ready ? <p className="chat-notice" role="status">Chat is being set up. Conversations will be available once setup is complete.</p> : null}
    {error ? <div className="chat-notice chat-notice--error" role="alert">{error}<button type="button" onClick={() => void refreshRooms()}>Try again</button></div> : null}
    <section className="chat-layout chat-layout--single" aria-label="Chat workspace">
      {room?.kind === 'manager' && !room.projectUnlocked && !staff ? <div className="chat-empty-conversation chat-project-locked"><span className="chat-empty-icon"><LockKeyhole size={32} strokeWidth={1.5} aria-hidden="true" /></span><h2>Project manager is available after purchasing a subscription.</h2><p>Choose an editing package to unlock your project group. Your admin team will be here immediately, and your manager will join once assigned.</p><Link className="chat-primary-button" to="/pricing">View subscriptions</Link><Link className="chat-text-button" to="/dashboard/tickets?new=1">Need help? Start a support ticket</Link></div>
      : selected ? <ChatConversation key={selected} actor={actor} roomId={selected} room={room} scope={scope} snapshot={snapshot} syncError={error} onHistorySearch={setHistorySearch} typing={typing?.roomId === selected ? typing.name : null} drafts={draftRef.current}
        onChange={scheduleRefresh} onUnavailable={() => { setSelected(null); scheduleRefresh(); }} />
        : <div className="chat-empty-conversation"><span className="chat-empty-icon">{ticketView ? <Ticket size={34} strokeWidth={1.5} aria-hidden="true" /> : <MessageCircle size={34} strokeWidth={1.5} aria-hidden="true" />}</span><h2>{!state.ready ? "Your conversations belong here." : ticketView ? staff ? 'Your support queue is clear.' : 'How can we help?' : actor.admin ? 'Your client groups belong here.' : 'A good edit starts with a conversation.'}</h2><p>{ticketView ? staff ? 'Select a ticket to reply, update its priority, or close it when resolved.' : 'Start a ticket about your account, billing, subscription, or project. You can track every reply here.' : actor.admin ? 'Customers appear here after a paid purchase. Assign their manager directly in the group.' : staff ? "Choose a conversation from your inbox." : "Talk through your next project with your team."}</p>{ticketView && !staff ? <button className="chat-primary-button" disabled={!state.ready} onClick={() => setShowNew(true)}>Start a ticket</button> : null}</div>}
    </section>
    {showNew ? ticketView ? <NewTicket scope={scope} onClose={() => setShowNew(false)} onCreated={item => { setShowNew(false); setFilter('all'); setSearch(''); setState(previous => ({ ...previous, rooms: [item, ...previous.rooms.filter(r => r.id !== item.id)] })); pickRoom(item.id); scheduleRefresh(); }} /> : <NewConversation scope={scope} onClose={() => setShowNew(false)} onCreated={id => { setShowNew(false); pickRoom(id); scheduleRefresh(); }} /> : null}
  </div>;
  return renderShell(content, navigationPanel);
}

function ChatConversation({ actor, roomId, room: initialRoom, scope, snapshot, syncError, onHistorySearch, typing, drafts, onChange, onUnavailable }: { actor: ChatActor; roomId: string; room?: ChatRoom; scope: string; snapshot: { history: ChatHistory; search: string } | null; syncError: string; onHistorySearch: (search: string) => void; typing: string | null; drafts: Map<string, string>; onChange: () => void; onUnavailable: () => void }) {
  const [room, setRoom] = useState(initialRoom), [messages, setMessages] = useState<VisibleChatMessage[]>([]), [receipts, setReceipts] = useState<ChatReceipt[]>([]), [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [draft, setDraft] = useState(drafts.get(roomId) ?? ""), [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState(""), [showSearch, setShowSearch] = useState(false), [emoji, setEmoji] = useState(false), [edit, setEdit] = useState<ChatMessage | null>(null), [editBody, setEditBody] = useState("");
  const [menu, setMenu] = useState<string | null>(null), [deleteId, setDeleteId] = useState<string | null>(null), [hasNew, setHasNew] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [atBottom, setAtBottom] = useState(true), [loadingOlder, setLoadingOlder] = useState(false), [sending, setSending] = useState(false);
  const settledSearch = useDebounced(search), listRef = useRef<HTMLDivElement>(null), composerRef = useRef<HTMLTextAreaElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false), nearBottomRef = useRef(true), messageRef = useRef(messages), latestReadRef = useRef(""), nonceRef = useRef<string | null>(null), typingAtRef = useRef(0);
  const searchRef = useRef(settledSearch);
  const currentSearchRef = useRef(settledSearch), mountedRef = useRef(true), unavailableRef = useRef(onUnavailable);
  currentSearchRef.current = settledSearch; unavailableRef.current = onUnavailable;
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  messageRef.current = messages;
  useEffect(() => { try { const saved = sessionStorage.getItem(`chat-draft:${actor.key}:${roomId}`); if (saved && !drafts.has(roomId)) { setDraft(saved.slice(0, 4000)); drafts.set(roomId, saved.slice(0, 4000)); } } catch { /* Storage may be unavailable in private browsing. */ } }, [actor.key, roomId, drafts]);
  useEffect(() => { if (initialRoom) setRoom(initialRoom); }, [initialRoom]);
  const applyHistory = useCallback((result: ChatHistory, older = false) => {
    if (!mountedRef.current) return;
    const previous = listRef.current?.scrollHeight ?? 0;
    const latest = result.messages.at(-1);
    const newMessage = latest && !messageRef.current.some(m => m.id === latest.id);
    const searchChanged = searchRef.current !== settledSearch; searchRef.current = settledSearch;
    if (!older && loadedRef.current && latest && latest.actorKey !== actor.key && !messageRef.current.some(m => m.id === latest.id)) setAnnouncement(`New message from ${latest.senderName}: ${latest.body.slice(0, 160) || "Attachment"}`);
    setRoom(result.room); setReceipts(result.receipts); setError("");
    setMessages(existing => {
      const confirmed = existing.filter(message => message.deliveryState !== "sending");
      const incomingNonces = new Set(result.messages.map(message => message.clientNonce));
      const confirmedIds = new Set(confirmed.map(message => message.id));
      const pending = existing.filter(message => message.deliveryState === "sending" && !incomingNonces.has(message.clientNonce));
      const overlap = result.messages.some(message => confirmedIds.has(message.id));
      // If reconnecting after a long gap, show the latest page with older history
      // available instead of silently leaving a hole between disconnected pages.
      const history = older ? mergeChatMessages(result.messages, confirmed) : searchChanged || settledSearch || (!overlap && confirmed.length > 0) ? result.messages : mergeChatMessages(confirmed, result.messages);
      return mergeVisibleChatMessages([...history, ...pending], result.messages);
    });
    const visibleIds = new Set(messageRef.current.map(message => message.id));
    if (older || !loadedRef.current || searchChanged || settledSearch || !result.messages.some(message => visibleIds.has(message.id))) setHasOlder(result.hasOlder);
    loadedRef.current = true; setLoading(false);
    requestAnimationFrame(() => {
      const list = listRef.current; if (!list) return;
      if (older) list.scrollTop += list.scrollHeight - previous;
      else if (nearBottomRef.current) list.scrollTop = list.scrollHeight;
      else if (newMessage) setHasNew(true);
    });
  }, [settledSearch, actor.key]);
  const fetchHistory = useCallback(async (older = false, signal?: AbortSignal) => {
    const first = older ? messageRef.current[0] : undefined;
    try {
      const result = await chatRequest<ChatHistory>(scope, "messages", { roomId, search: settledSearch, ...(first ? { beforeAt: first.createdAt, beforeId: first.id } : {}) }, undefined, signal);
      if (!signal?.aborted && mountedRef.current && settledSearch === currentSearchRef.current) applyHistory(result, older);
    } catch (e) { if (mountedRef.current && e instanceof ChatRequestError && e.status === 404) { setMessages([]); unavailableRef.current(); } throw e; }
  }, [scope, roomId, settledSearch, applyHistory]);
  useEffect(() => { onHistorySearch(settledSearch); }, [settledSearch, onHistorySearch]);
  useEffect(() => {
    if (snapshot?.history.room.id === roomId && snapshot.search === settledSearch) applyHistory(snapshot.history);
  }, [snapshot, roomId, settledSearch, applyHistory]);
  useEffect(() => { if (syncError) { setError(syncError); setLoading(false); } }, [syncError]);
  useEffect(() => {
    if (settledSearch || document.visibilityState !== "visible" || !atBottom || !room?.unreadCount) return;
    const messageId = chatReadMessageId(messages, room.unreadCount, latestReadRef.current); if (!messageId) return;
    const timer = setTimeout(() => { if (document.visibilityState !== "visible" || !nearBottomRef.current) return; latestReadRef.current = messageId; void chatRequest(scope, "", {}, makeForm({ intent: "read", roomId, messageId })).then(onChange).catch(() => { latestReadRef.current = ""; }); }, 700);
    return () => clearTimeout(timer);
  }, [messages, settledSearch, scope, roomId, onChange, atBottom, room?.unreadCount]);
  const updateDraft = (value: string) => { setDraft(value); drafts.set(roomId, value); nonceRef.current = null;
    try { if (value) sessionStorage.setItem(`chat-draft:${actor.key}:${roomId}`, value); else sessionStorage.removeItem(`chat-draft:${actor.key}:${roomId}`); } catch { /* Keep the in-memory draft. */ }
    if (value.trim() && room && canSendChatMessage(actor, room) && Date.now() - typingAtRef.current > 6000) { typingAtRef.current = Date.now(); void chatRequest(scope, "", {}, makeForm({ intent: "typing", roomId })).catch(() => {}); }
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault(); if (busy || (!draft.trim() && !file) || !room || !canSendChatMessage(actor, room)) return;
    setBusy(true); setSending(true); setError(""); const nonce = nonceRef.current ?? crypto.randomUUID(); nonceRef.current = nonce;
    const submittedDraft = draft, submittedFile = file;
    const form = makeForm({ intent: "send", roomId, body: submittedDraft, nonce }); if (submittedFile) form.set("file", submittedFile);
    const pending: VisibleChatMessage = { id: `pending:${nonce}`, roomId, actorKey: actor.key, senderName: chatSenderName(actor.role, actor.name), senderRole: actor.role, body: submittedDraft.trim(), clientNonce: nonce, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, attachment: submittedFile ? { publicId: "", name: submittedFile.name, mime: submittedFile.type, bytes: submittedFile.size } : null, deliveryState: "sending" };
    setMessages(current => mergeChatMessages(current, [pending])); setDraft(""); drafts.delete(roomId); try { sessionStorage.removeItem(`chat-draft:${actor.key}:${roomId}`); } catch {} setFile(null); setEmoji(false); nearBottomRef.current = true;
    requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; });
    try {
      const result = await chatRequest<{ message: ChatMessage }>(scope, "", {}, form);
      setMessages(current => mergeVisibleChatMessages(current, [result.message]));
      if (nonceRef.current === nonce) nonceRef.current = null;
      onChange(); requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; composerRef.current?.focus({ preventScroll: true }); });
    } catch (e) {
      setMessages(current => current.filter(message => message.clientNonce !== nonce || message.deliveryState !== "sending"));
      setDraft(submittedDraft); drafts.set(roomId, submittedDraft); try { sessionStorage.setItem(`chat-draft:${actor.key}:${roomId}`, submittedDraft); } catch {}
      setFile(submittedFile); setError((e as Error).message);
    } finally { setBusy(false); setSending(false); }
  };
  const changeMessage = async (intent: "edit" | "delete", messageId: string, body = "") => {
    if (busy) return; setBusy(true); setError("");
    try { const result = await chatRequest<{ message: ChatMessage }>(scope, "", {}, makeForm({ intent, roomId, messageId, body })); setMessages(current => mergeChatMessages(current, [result.message])); setEdit(null); setDeleteId(null); setMenu(null); onChange(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const sendAllowed = Boolean(room && canSendChatMessage(actor, room));
  const showManagerTools = actor.admin && room?.kind === "manager";
  const conversationSearch = showSearch ? <label className="chat-search chat-message-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search this conversation" placeholder="Search this conversation" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} /></label> : null;
  return <div className="chat-conversation">
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    <header className={`chat-conversation-header${showManagerTools ? " has-manager-tools" : ""}`}><Initials name={room ? chatIsStaff(actor) ? room.clientName : room.managerName ?? "Project group" : "Conversation"} support={room?.kind === "support"} /><div className="chat-conversation-title"><h2>{room ? chatRoomTitle(actor, room) : "Conversation"}</h2><p>{room ? room.ticket ? `#${room.ticket.number} · ${TICKET_CATEGORIES[room.ticket.category]}${chatIsStaff(actor) ? ` · ${room.clientName}` : ''}` : `${chatIsStaff(actor) ? `${room.clientName} · ` : ''}Admin team${room.managerActive ? ` · ${room.managerName ?? 'Project manager'}` : ' · Manager joining soon'}` : "Loading conversation…"}</p></div><button className="chat-icon-button" aria-label={showSearch ? "Close message search" : "Search messages"} aria-expanded={showSearch} onClick={() => { setShowSearch(v => !v); setSearch(""); }}><Search size={19} /></button>{showManagerTools && room ? <ManagerAssignment key={`${room.id}:${room.managerId ?? ""}`} scope={scope} room={room} onChange={onChange} /> : null}</header>
    {room?.ticket ? <TicketControls actor={actor} scope={scope} room={room} onChange={updated => { setRoom(updated); onChange(); }} /> : null}
    {conversationSearch}
    <div className="chat-timeline" ref={listRef} onScroll={event => { const list = event.currentTarget; nearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 70; setAtBottom(nearBottomRef.current); if (nearBottomRef.current) setHasNew(false); }} aria-label="Message history" aria-busy={loading}>
      {hasOlder ? <button className="chat-text-button chat-load-more" disabled={loadingOlder} onClick={() => { setLoadingOlder(true); void fetchHistory(true).catch(e => setError((e as Error).message)).finally(() => setLoadingOlder(false)); }}>{loadingOlder ? "Loading history…" : "Load older messages"}</button> : null}
      {loading ? <p className="chat-history-status" role="status">Loading conversation…</p> : null}
      {!loading && !messages.length ? <div className="chat-empty-thread"><span className="chat-empty-icon">{room?.kind === "support" ? <Headphones size={30} aria-hidden="true" /> : <MessageCircle size={30} aria-hidden="true" />}</span><h3>{settledSearch ? "No matching messages." : 'Your project team is here.'}</h3><p>{settledSearch ? "Try another word or clear your search." : 'Message the admin team now. Your project manager will join this same group once assigned.'}</p></div> : null}
      {messages.map((message, index) => { const own = message.actorKey === actor.key, senderName = chatSenderName(message.senderRole, message.senderName), day = new Date(message.createdAt).toLocaleDateString("en-US"), previousDay = messages[index - 1] ? new Date(messages[index - 1].createdAt).toLocaleDateString("en-US") : null;
        if (message.senderRole === 'system') return <div key={message.id} className={`ticket-activity ${message.actorKey === 'system:assignment' ? 'chat-activity--assignment' : ''}`}><p>{message.actorKey === 'system:assignment' ? <Users size={15} aria-hidden="true" /> : null}<span>{message.body}</span></p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div>;
        const seen = receipts.filter(r => r.lastReadAt > message.createdAt || (r.lastReadAt === message.createdAt && (r.lastReadId ?? "") >= message.id)), readerNames = [...new Set(seen.map(r => chatSenderName(r.role, r.name)))]; const download = `/api/chat?${new URLSearchParams({ scope, operation: "attachment", roomId, messageId: message.id })}`;
        return <div key={message.id}>{day !== previousDay ? <div className="chat-day">{new Date(message.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div> : null}
          <article className={`chat-message ${own ? "chat-message--own" : ""}`} aria-label={`Message from ${senderName}`}>
            {!own ? <span className="chat-sender">{senderName}<span>{chatRoleLabel(message.senderRole)}</span></span> : null}
            <div className={`chat-bubble ${message.deletedAt ? "chat-bubble--deleted" : ""}`}>
              {message.deletedAt ? <p>Message deleted</p> : <>{message.body ? <MessageBody body={message.body} /> : null}{message.attachment ? message.deliveryState === "sending" ? <span className="chat-attachment"><Paperclip size={18} aria-hidden="true" /><span>{message.attachment.name}<small>{(message.attachment.bytes / 1024).toFixed(0)} KB · Uploading…</small></span></span> : <a className="chat-attachment" href={download} target="_blank" rel="noopener noreferrer"><Paperclip size={18} aria-hidden="true" /><span>{message.attachment.name}<small>{(message.attachment.bytes / 1024).toFixed(0)} KB · Download</small></span></a> : null}</>}
            </div>
            <div className="chat-message-meta">{message.deliveryState === "sending" ? <span className="chat-message-pending" role="status">Sending…</span> : <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>}{message.editedAt && !message.deletedAt ? <span>Edited</span> : null}{own && !message.deletedAt && message.deliveryState !== "sending" ? <span className={`chat-delivery ${seen.length ? "is-read" : ""}`} title={seen.length ? `Read by ${readerNames.join(", ")}` : "Saved and sent"}>{seen.length ? <CheckCheck size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}<span className="sr-only">{seen.length ? "Read" : "Sent"}</span></span> : null}
              {own && !message.deletedAt && message.deliveryState !== "sending" && sendAllowed ? <div className="chat-message-actions"><button className="chat-message-menu-trigger" aria-label="Message options" aria-expanded={menu === message.id} onClick={() => setMenu(menu === message.id ? null : message.id)}><MoreHorizontal size={16} /></button>{menu === message.id ? <div className="chat-message-menu">{message.body ? <button onClick={() => { setEdit(message); setEditBody(message.body); setMenu(null); }}>Edit message</button> : null}<button onClick={() => { setDeleteId(message.id); setMenu(null); }}>Delete message</button><button onClick={() => setMenu(null)}>Close</button></div> : null}</div> : null}
            </div>
          </article></div>;
      })}
    </div>
    {hasNew ? <button className="chat-new-messages" onClick={() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; nearBottomRef.current = true; setAtBottom(true); setHasNew(false); }}>New messages ↓</button> : null}
    <p className="chat-typing" role="status" aria-live="polite">{typing ? `${typing} is typing…` : ""}</p>
    {error ? <div className="chat-conversation-error" role="alert">{error}<button className="chat-text-button" onClick={() => void fetchHistory().catch(e => setError((e as Error).message))}>Refresh conversation</button>{error.includes("unavailable") ? <button className="chat-text-button" onClick={onUnavailable}>Return to inbox</button> : null}</div> : null}
    {edit ? <form className="chat-edit-form" onSubmit={e => { e.preventDefault(); void changeMessage("edit", edit.id, editBody); }}><label htmlFor="chat-edit-body">Edit your message</label><textarea id="chat-edit-body" autoFocus value={editBody} maxLength={4000} onChange={e => setEditBody(e.target.value)} /><div><button type="button" className="chat-text-button" onClick={() => setEdit(null)} disabled={busy}>Cancel</button><button className="chat-primary-button" disabled={busy || !editBody.trim()}>Save edit</button></div></form> : <form className="chat-composer" onSubmit={send}>
      {file ? <div className="chat-file-draft"><Paperclip size={16} aria-hidden="true" /><span>{file.name}</span><button type="button" aria-label="Remove attachment" disabled={busy} onClick={() => { setFile(null); nonceRef.current = null; }}><X size={16} /></button></div> : null}
      {emoji ? <div className="chat-emoji-picker" aria-label="Choose an emoji">{["😊", "👍", "❤️", "🎉", "🙏", "✅", "👋", "🔥"].map(item => <button key={item} type="button" aria-label={`Insert ${item}`} onClick={() => { updateDraft(`${draft}${item}`); setEmoji(false); composerRef.current?.focus(); }}>{item}</button>)}</div> : null}
      <label className="sr-only" htmlFor="chat-draft">{room?.ticket ? 'Ticket reply' : 'Message'}</label><textarea id="chat-draft" ref={composerRef} value={draft} rows={2} maxLength={4000} disabled={busy || !sendAllowed} placeholder={sendAllowed ? room?.ticket ? 'Write a reply…' : "Write a message…" : room?.ticket?.status === 'closed' ? 'This ticket is closed. Reopen it to reply.' : room?.clientActive === false ? "This client account is inactive" : "Project manager is available after purchasing a subscription"} onChange={e => updateDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
      <div className="chat-composer-tools"><div><input type="file" ref={fileRef} hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { const candidate = e.target.files?.[0]; e.target.value = ""; if (candidate) { if (!candidate.size || candidate.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(candidate.type)) setError("Choose a non-empty JPG, PNG, WebP, or PDF up to 5 MB."); else { setFile(candidate); nonceRef.current = null; setError(""); } } }} /><button type="button" className="chat-icon-button" aria-label="Attach a file" title="JPG, PNG, WebP, or PDF · up to 5 MB" disabled={busy || !sendAllowed} onClick={() => fileRef.current?.click()}><Paperclip size={19} /></button><button type="button" className="chat-icon-button" aria-label="Choose an emoji" aria-expanded={emoji} disabled={busy || !sendAllowed} onClick={() => setEmoji(v => !v)}><Smile size={19} /></button><span className="chat-composer-hint">Shift + Enter for a new line</span></div><button className="chat-send" disabled={busy || !sendAllowed || (!draft.trim() && !file)}><span>{sending ? "Sending…" : "Send"}</span><Send size={17} aria-hidden="true" /></button></div>
    </form>}
    {deleteId ? <ChatDialog title="Delete this message?" onClose={() => !busy && setDeleteId(null)}><p>The message and its attachment will be removed for everyone in this conversation.</p><div className="chat-dialog-actions"><button className="chat-text-button" disabled={busy} onClick={() => setDeleteId(null)}>Keep message</button><button className="chat-primary-button" disabled={busy} onClick={() => void changeMessage("delete", deleteId)}>Delete message</button></div></ChatDialog> : null}
  </div>;
}

function ManagerAssignment({ room, scope, onChange }: { room: ChatRoom; scope: string; onChange: () => void }) {
  const [people, setPeople] = useState<ChatPerson[]>([]), [peopleLoaded, setPeopleLoaded] = useState(false), [manager, setManager] = useState(room.managerId ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { const abort = new AbortController(); void chatRequest<{ managers: ChatPerson[] }>(scope, "people", {}, undefined, abort.signal).then(result => { if (!abort.signal.aborted) { setPeople(result.managers); setPeopleLoaded(true); } }).catch(e => { if (!abort.signal.aborted) { setError((e as Error).message); setPeopleLoaded(true); } }); return () => abort.abort(); }, [scope]);
  return <form className="chat-assignment" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await chatRequest(scope, "", {}, makeForm({ intent: "assign", roomId: room.id, managerId: manager, expectedManagerId: room.managerId ?? "" })); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><label htmlFor="chat-manager">Project manager</label><div><select id="chat-manager" value={manager} disabled={busy || !room.clientActive} onChange={e => setManager(e.target.value)}><option value="">Not assigned</option>{room.managerId && !people.some(p => p.id === room.managerId) ? <option value={room.managerId}>{peopleLoaded && !error ? "Previous manager (unavailable)" : room.managerName ?? "Loading manager…"}</option> : null}{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button disabled={busy || !room.clientActive || manager === (room.managerId ?? "")}>{busy ? "Saving…" : "Assign"}</button></div>{!peopleLoaded ? <p role="status">Loading project managers…</p> : !people.length && !error ? <p>No active project managers are available to assign.</p> : null}{error ? <p role="alert">{error}</p> : null}</form>;
}
function ChatDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { ref.current?.close(); if (previous?.isConnected) previous.focus(); }; }, []);
  return <dialog ref={ref} className="chat-dialog" aria-labelledby="chat-dialog-title" onCancel={e => { e.preventDefault(); closeRef.current(); }}><div className="chat-dialog-heading"><h2 id="chat-dialog-title">{title}</h2><button className="chat-icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
function TicketControls({ actor, scope, room, onChange }: { actor: ChatActor; scope: string; room: ChatRoom; onChange: (room: ChatRoom) => void }) {
  const ticket = room.ticket!, staff = chatIsStaff(actor);
  const [priority, setPriority] = useState<string>(ticket.priority), [status, setStatus] = useState<string>(ticket.status), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => { setPriority(ticket.priority); setStatus(ticket.status); }, [ticket.priority, ticket.status]);
  const update = async (nextStatus = status, nextPriority = priority) => {
    if (busy) return; setBusy(true); setError('');
    try { const result = await chatRequest<{ room: ChatRoom }>(scope, '', {}, makeForm({ intent: 'ticket-update', roomId: room.id, status: nextStatus, priority: nextPriority, expectedUpdatedAt: ticket.updatedAt })); onChange(result.room); setConfirmClose(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="ticket-controls">
    <div className="ticket-controls-row"><span className={`ticket-status ticket-status--${ticket.status}`}>{TICKET_STATUSES[ticket.status]}</span>
      {staff ? <><label><span>Status</span><select value={status} disabled={busy || !room.clientActive} onChange={e => setStatus(e.target.value)}>{Object.entries(TICKET_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Priority</span><select value={priority} disabled={busy || !room.clientActive} onChange={e => setPriority(e.target.value)}>{Object.entries(TICKET_PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{status !== ticket.status || priority !== ticket.priority ? <button className="chat-text-button" disabled={busy || !room.clientActive} onClick={() => status === 'closed' && ticket.status !== 'closed' ? setConfirmClose(true) : void update()}>{busy ? 'Saving…' : 'Save changes'}</button> : null}</> : <span className="ticket-priority">{TICKET_PRIORITIES[ticket.priority]} priority</span>}
      <button type="button" className="ticket-state-button" disabled={busy || !room.clientActive} onClick={() => ticket.status === 'closed' ? void update('waiting_support', ticket.priority) : setConfirmClose(true)}>{busy ? 'Saving…' : ticket.status === 'closed' ? 'Reopen ticket' : 'Close ticket'}</button>
    </div>
    {ticket.status === 'closed' ? <p className="ticket-closed-note">Closed {ticket.closedAt ? new Date(ticket.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}. Your conversation stays here. Reopen the ticket if you need more help.</p> : null}
    {error ? <p className="ticket-control-error" role="alert">{error}<button type="button" className="chat-text-button" onClick={() => onChange(room)}>Refresh ticket</button></p> : null}
    {confirmClose ? <ChatDialog title="Close this ticket?" onClose={() => !busy && setConfirmClose(false)}><p>Close the ticket when the issue is resolved. Its conversation and attachments stay saved, and you can reopen it later.</p><div className="chat-dialog-actions"><button className="chat-text-button" disabled={busy} onClick={() => setConfirmClose(false)}>Keep open</button><button className="chat-primary-button" disabled={busy} onClick={() => void update('closed')}>{busy ? 'Closing…' : 'Close ticket'}</button></div></ChatDialog> : null}
  </div>;
}
function NewTicket({ scope, onClose, onCreated }: { scope: string; onClose: () => void; onCreated: (room: ChatRoom) => void }) {
  const [subject, setSubject] = useState(''), [category, setCategory] = useState(''), [priority, setPriority] = useState('normal'), [body, setBody] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const nonce = useRef<string | null>(null);
  return <ChatDialog title="Start a support ticket" onClose={() => !busy && onClose()}><p>Choose the issue type and tell us what happened. Your ticket goes directly to the admin and support team.</p><form className="ticket-form" onSubmit={async e => {
    e.preventDefault(); if (busy) return; const id = nonce.current ?? crypto.randomUUID(); nonce.current = id;
    const invalid = validateSupportTicket(subject, category, body, priority, id); if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try { const result = await chatRequest<{ room: ChatRoom }>(scope, '', {}, makeForm({ intent: 'ticket-create', subject, category, priority, body, nonce: id })); onCreated(result.room); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }}>
    <label htmlFor="ticket-category">What do you need help with?</label><select id="ticket-category" value={category} required disabled={busy} onChange={e => { nonce.current = null; setError(''); setCategory(e.target.value); }}><option value="">Choose an issue type</option>{Object.entries(TICKET_CATEGORIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
    <label htmlFor="ticket-subject">Subject</label><input id="ticket-subject" autoFocus value={subject} required minLength={3} maxLength={160} disabled={busy} placeholder="A brief summary of the issue" onChange={e => { nonce.current = null; setError(''); setSubject(e.target.value); }} />
    <label htmlFor="ticket-priority">Priority</label><select id="ticket-priority" value={priority} disabled={busy} onChange={e => { nonce.current = null; setError(''); setPriority(e.target.value); }}><option value="low">Low · General question</option><option value="normal">Normal · I need help</option><option value="high">High · My work is blocked</option></select>
    <label htmlFor="ticket-body">Tell us about the issue</label><textarea id="ticket-body" rows={5} value={body} required maxLength={4000} disabled={busy} placeholder="What happened, what you expected, and any details that will help us" onChange={e => { nonce.current = null; setError(''); setBody(e.target.value); }} /><small>You can add JPG, PNG, WebP, or PDF attachments in the ticket conversation.</small>
    {error ? <p className="ticket-control-error" role="alert">{error}</p> : null}<div className="chat-dialog-actions"><button type="button" className="chat-text-button" disabled={busy} onClick={onClose}>Cancel</button><button className="chat-primary-button" disabled={busy}>{busy ? 'Opening ticket…' : 'Start ticket'}</button></div>
  </form></ChatDialog>;
}
function NewConversation({ scope, onClose, onCreated }: { scope: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [search, setSearch] = useState(""), [clients, setClients] = useState<ChatPerson[]>([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""); const settled = useDebounced(search);
  useEffect(() => { const abort = new AbortController(); setLoading(true); void chatRequest<{ clients: ChatPerson[] }>(scope, "people", { search: settled }, undefined, abort.signal).then(result => { if (!abort.signal.aborted) { setClients(result.clients); setError(""); setLoading(false); } }).catch(e => { if (!abort.signal.aborted) { setClients([]); setError((e as Error).message); setLoading(false); } }); return () => abort.abort(); }, [scope, settled]);
  return <ChatDialog title="Open a project group" onClose={() => !busy && onClose()}><p>Customers with a paid purchase appear automatically. Open their group to chat or assign a project manager.</p><label className="chat-search"><Search size={17} aria-hidden="true" /><input autoFocus type="search" aria-label="Find a client" placeholder="Find a client by name or email" maxLength={120} value={search} onChange={e => { setSearch(e.target.value); setClients([]); setLoading(true); setError(""); }} /></label><div className="chat-client-options">{clients.map(client => <button key={client.id} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const result = await chatRequest<{ rooms: { id: string; kind: string }[] }>(scope, "", {}, makeForm({ intent: "create", clientId: client.id })); onCreated(result.rooms.find(r => r.kind === "manager")?.id ?? result.rooms[0].id); } catch (e) { setError((e as Error).message); setBusy(false); } }}><Initials name={client.name} /><span>{client.name}<small>{client.email}</small></span><MessageCircle size={17} aria-hidden="true" /></button>)}{loading ? <p role="status">Searching customers…</p> : !clients.length && !error ? <p>No customers with a paid purchase match.</p> : null}</div>{error ? <p role="alert" className="chat-conversation-error">{error}</p> : null}</ChatDialog>;
}
