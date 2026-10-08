import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, CheckCheck, Headphones, MessageCircle, MoreHorizontal, Paperclip, Search, Send, Smile, UserRound, Users, X } from "lucide-react";
import { canSendChatMessage, chatIsStaff, chatRoleLabel, chatRoomTitle, mergeChatMessages, type ChatActor, type ChatMessage, type ChatPerson, type ChatReceipt, type ChatRoom, type ChatState } from "../lib/chat";
import type { WorkspaceNavigationPanel } from "./WorkspaceShell";

class ChatRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function chatRequest<T>(scope: string, operation: string, values: Record<string, string> = {}, form?: FormData, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ scope, operation, ...values });
  const response = await fetch(`/api/chat?${query}`, { method: form ? "POST" : "GET", body: form, signal: signal ?? AbortSignal.timeout(25_000), credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Your session needs refreshing. Reload this page to sign in again.");
  const result = await response.json() as T & { error?: string }; if (!response.ok) throw new ChatRequestError(result.error ?? "Chat could not be updated. Try again.", response.status);
  return result as T;
}
const makeForm = (values: Record<string, string>) => { const form = new FormData(); for (const [key, value] of Object.entries(values)) form.set(key, value); return form; };
function Initials({ name, support = false }: { name: string; support?: boolean }) {
  return <span className={`chat-avatar ${support ? "chat-avatar--support" : ""}`} aria-hidden="true">{support ? <Headphones size={20} /> : name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || <UserRound size={20} />}</span>;
}
function MessageBody({ body }: { body: string }) {
  return <p>{body.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) => index % 2 ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part)}</p>;
}
function useDebounced(value: string) { const [settled, set] = useState(value); useEffect(() => { const timer = setTimeout(() => set(value), 300); return () => clearTimeout(timer); }, [value]); return settled; }
function useChatSocket(scope: string, enabled: boolean, onEvent: (event: { type: string; roomId?: string; name?: string; actorKey?: string }) => void) {
  const [status, setStatus] = useState("Connecting"); const eventRef = useRef(onEvent); eventRef.current = onEvent;
  useEffect(() => {
    if (!enabled) { setStatus("Not available"); return; }
    let disposed = false, socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, failures = 0, lastPong = Date.now();
    const connect = () => {
      if (disposed) return; setStatus(failures ? "Reconnecting" : "Connecting");
      const url = new URL(`/api/chat/socket?scope=${scope}`, window.location.origin); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.onopen = () => { failures = 0; lastPong = Date.now(); setStatus("Live"); eventRef.current({ type: "refresh" }); };
      socket.onmessage = message => { lastPong = Date.now(); if (message.data === "pong") return; try { const event = JSON.parse(message.data); if (["typing", "refresh"].includes(event.type)) eventRef.current(event); } catch { /* Ignore non-protocol frames. */ } };
      socket.onerror = () => socket?.close();
      socket.onclose = () => { if (!disposed) { setStatus("Reconnecting"); timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(++failures, 5)) + Math.random() * 500); } };
    };
    connect();
    const heartbeat = setInterval(() => { if (socket?.readyState === WebSocket.OPEN) { if (Date.now() - lastPong > 65_000) socket.close(); else socket.send("ping"); } if (document.visibilityState === "visible") eventRef.current({ type: "refresh" }); }, 30_000);
    const resume = () => { if (document.visibilityState === "visible") { eventRef.current({ type: "refresh" }); if (socket?.readyState === WebSocket.OPEN) socket.send("ping"); } };
    window.addEventListener("online", resume); window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { disposed = true; clearTimeout(timer); clearInterval(heartbeat); socket?.close(1000); window.removeEventListener("online", resume); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [scope, enabled]);
  return status;
}

export function ChatWorkspace({ actor, initialState, renderShell }: { actor: ChatActor; initialState: ChatState; renderShell: (content: ReactNode, navigation: WorkspaceNavigationPanel) => ReactNode }) {
  const scope = actor.admin ? "admin" : "client";
  const [state, setState] = useState(initialState), [selected, setSelected] = useState<string | null>(initialState.rooms[0]?.id ?? null);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0), [typing, setTyping] = useState<{ roomId: string; name: string; expires: number } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const settledSearch = useDebounced(search); const draftRef = useRef(new Map<string, string>()); const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestGeneration = useRef(0);
  const refreshRooms = useCallback(async (page = 1, append = false) => {
    if (!initialState.ready) return;
    const generation = ++requestGeneration.current;
    try { const result = await chatRequest<ChatState>(scope, "rooms", { page: String(page), search: settledSearch, filter });
      if (generation !== requestGeneration.current) return;
      setState(previous => ({ ...result, rooms: append ? [...previous.rooms.filter(room => !result.rooms.some(r => r.id === room.id)), ...result.rooms] : result.rooms })); setError("");
    } catch (e) { if (generation === requestGeneration.current) setError((e as Error).message); }
  }, [scope, initialState.ready, settledSearch, filter]);
  useEffect(() => { void refreshRooms(); }, [refreshRooms]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  const onSocket = useCallback((event: { type: string; roomId?: string; name?: string; actorKey?: string }) => {
    if (event.type === "typing" && event.actorKey !== actor.key && event.roomId && event.name) { setTyping({ roomId: event.roomId, name: event.name, expires: Date.now() + 7000 }); return; }
    clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(() => { void refreshRooms(); setRefresh(value => value + 1); }, 150);
  }, [actor.key, refreshRooms]);
  const status = useChatSocket(scope, state.ready, onSocket);
  useEffect(() => { if (!typing) return; const timer = setTimeout(() => setTyping(null), Math.max(0, typing.expires - Date.now())); return () => clearTimeout(timer); }, [typing]);
  const room = state.rooms.find(r => r.id === selected);
  const pickRoom = (id: string) => { setSelected(id); setError(""); setTyping(null); };
  const staff = chatIsStaff(actor);
  const navigationPanel: WorkspaceNavigationPanel = ({ collapsed, closeMenu, returnToMainMenu }) => <div className={`chat-navigation chat-workspace ${collapsed ? "chat-navigation--collapsed" : ""}`}>
      <button type="button" className="chat-main-menu" title={collapsed ? "Back to main menu" : undefined} onClick={returnToMainMenu}><ArrowLeft size={18} aria-hidden="true" /><span className={collapsed ? "sr-only" : ""}>Back to main menu</span></button>
      <div className="chat-rooms">
        <div className="chat-rooms-heading"><h2 className={collapsed ? "sr-only" : ""}>{actor.admin ? "All conversations" : staff ? "Conversations" : "Your conversations"}</h2>{actor.admin && !collapsed ? <button className="chat-icon-button" title="Start a conversation" aria-label="Start a conversation" disabled={!state.ready} onClick={() => { closeMenu(); setShowNew(true); }}><Users size={19} /></button> : null}</div>
        {staff ? <><label className="chat-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search conversations" placeholder="Search conversations" value={search} maxLength={120} onChange={e => setSearch(e.target.value)} /></label><div className="chat-filters" aria-label="Conversation filter">{["all", "manager", "support"].map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "manager" ? "Managers" : "Support"}</button>)}</div></> : null}
        <div className="chat-room-list">{state.rooms.map(item => <button type="button" key={item.id} className={`chat-room ${selected === item.id ? "is-selected" : ""}`} aria-pressed={selected === item.id} aria-label={collapsed ? `${chatRoomTitle(actor, item)}${item.unreadCount ? `, ${item.unreadCount} unread messages` : ""}` : undefined} title={collapsed ? chatRoomTitle(actor, item) : undefined} onClick={() => { pickRoom(item.id); closeMenu(); }}>
          <Initials name={staff ? item.clientName : item.managerName ?? "Project manager"} support={item.kind === "support" && !staff} />
          <span className="chat-room-copy"><span className="chat-room-title">{chatRoomTitle(actor, item)}</span><span className="chat-room-label">{staff ? item.kind === "support" ? "Customer support" : item.managerActive ? item.managerName ?? "Project manager" : "Manager not assigned" : item.kind === "support" ? "Questions? We’re here." : item.managerActive ? item.managerName ?? "Project manager" : "Waiting for assignment"}</span><span className="chat-room-preview">{item.lastMessagePreview ?? "Start the conversation"}</span></span>
          {item.unreadCount > 0 ? <span className="chat-unread" aria-label={`${item.unreadCount} unread messages`}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : null}
        </button>)}
          {!state.rooms.length ? <div className="chat-list-empty"><MessageCircle size={26} aria-hidden="true" /><p>{search || filter !== "all" ? "No conversations match." : actor.role === "project_manager" ? "Your assigned clients will appear here." : "No conversations yet."}</p>{actor.admin && state.ready ? <button className="chat-text-button" onClick={() => { closeMenu(); setShowNew(true); }}>Start a conversation</button> : null}</div> : null}
          {state.hasMore ? <button className="chat-text-button chat-load-more" onClick={() => void refreshRooms(state.page + 1, true)}>Load more conversations</button> : null}
        </div>
      </div>
    </div>;
  const content = <div className="chat-workspace">
    <div className="chat-page-heading"><div><h2>{actor.admin ? "Chat rooms" : staff ? "Team inbox" : "Let’s keep in touch."}</h2><p>{actor.admin ? "Every client conversation, with the right people connected." : staff ? "Keep conversations moving with your clients." : "Your manager and our support team, all in one place."}</p></div>
      <span className={`chat-connection ${status === "Live" ? "is-live" : ""}`} role="status"><span aria-hidden="true" />{status}</span></div>
    {!state.ready ? <p className="chat-notice" role="status">Chat is being set up. Conversations will be available once setup is complete.</p> : null}
    {error ? <div className="chat-notice chat-notice--error" role="alert">{error}<button type="button" onClick={() => void refreshRooms()}>Try again</button></div> : null}
    <section className="chat-layout chat-layout--single" aria-label="Chat workspace">
      {selected ? <ChatConversation key={selected} actor={actor} roomId={selected} room={room} scope={scope} refresh={refresh} typing={typing?.roomId === selected ? typing.name : null} drafts={draftRef.current}
        onChange={() => { void refreshRooms(); setRefresh(v => v + 1); }} onUnavailable={() => { setSelected(null); void refreshRooms(); }} />
        : <div className="chat-empty-conversation"><span className="chat-empty-icon"><MessageCircle size={34} strokeWidth={1.5} aria-hidden="true" /></span><h2>{state.ready ? "A good edit starts with a conversation." : "Your conversations belong here."}</h2><p>{actor.admin ? "Select a room to see its full conversation and assign a project manager." : staff ? "Choose a conversation from your inbox." : "Talk through your next project with your manager, or ask our support team for help."}</p></div>}
    </section>
    {showNew ? <NewConversation scope={scope} onClose={() => setShowNew(false)} onCreated={id => { setShowNew(false); pickRoom(id); void refreshRooms(); }} /> : null}
  </div>;
  return renderShell(content, navigationPanel);
}

type History = { room: ChatRoom; messages: ChatMessage[]; hasOlder: boolean; receipts: ChatReceipt[] };
function ChatConversation({ actor, roomId, room: initialRoom, scope, refresh, typing, drafts, onChange, onUnavailable }: { actor: ChatActor; roomId: string; room?: ChatRoom; scope: string; refresh: number; typing: string | null; drafts: Map<string, string>; onChange: () => void; onUnavailable: () => void }) {
  const [room, setRoom] = useState(initialRoom), [messages, setMessages] = useState<ChatMessage[]>([]), [receipts, setReceipts] = useState<ChatReceipt[]>([]), [hasOlder, setHasOlder] = useState(false);
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
  const fetchHistory = useCallback(async (older = false, signal?: AbortSignal) => {
    const first = older ? messageRef.current[0] : undefined;
    let result: History;
    try { result = await chatRequest<History>(scope, "messages", { roomId, search: settledSearch, ...(first ? { beforeAt: first.createdAt, beforeId: first.id } : {}) }, undefined, signal); }
    catch (e) { if (mountedRef.current && e instanceof ChatRequestError && e.status === 404) { setMessages([]); unavailableRef.current(); } throw e; }
    if (signal?.aborted || !mountedRef.current || settledSearch !== currentSearchRef.current) return;
    const previous = listRef.current?.scrollHeight ?? 0;
    const latest = result.messages.at(-1);
    const newMessage = latest && !messageRef.current.some(m => m.id === latest.id);
    const searchChanged = searchRef.current !== settledSearch; searchRef.current = settledSearch;
    if (!older && loadedRef.current && latest && latest.actorKey !== actor.key && !messageRef.current.some(m => m.id === latest.id)) setAnnouncement(`New message from ${latest.senderName}: ${latest.body.slice(0, 160) || "Attachment"}`);
    setRoom(result.room); setReceipts(result.receipts); setError("");
    setMessages(existing => {
      const overlap = result.messages.some(m => existing.some(e => e.id === m.id));
      // If reconnecting after a long gap, show the latest page with older history
      // available instead of silently leaving a hole between disconnected pages.
      return older ? mergeChatMessages(result.messages, existing) : searchChanged || settledSearch || (!overlap && existing.length > 0) ? result.messages : mergeChatMessages(existing, result.messages);
    });
    if (older || !loadedRef.current || searchChanged || settledSearch || !result.messages.some(m => messageRef.current.some(e => e.id === m.id))) setHasOlder(result.hasOlder);
    loadedRef.current = true; setLoading(false);
    requestAnimationFrame(() => {
      const list = listRef.current; if (!list) return;
      if (older) list.scrollTop += list.scrollHeight - previous;
      else if (nearBottomRef.current) list.scrollTop = list.scrollHeight;
      else if (newMessage) setHasNew(true);
    });
  }, [scope, roomId, settledSearch, actor.key]);
  useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(() => { controller.abort(); setError("The conversation took too long to load. Try refreshing it."); setLoading(false); }, 25_000);
    void fetchHistory(false, controller.signal).catch(e => { if (!controller.signal.aborted) { setError((e as Error).message); setLoading(false); } }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fetchHistory, refresh]);
  useEffect(() => {
    if (settledSearch || document.visibilityState !== "visible" || !atBottom) return;
    const latest = messages.at(-1); if (!latest || latestReadRef.current === latest.id) return;
    const timer = setTimeout(() => { if (document.visibilityState !== "visible" || !nearBottomRef.current) return; latestReadRef.current = latest.id; void chatRequest(scope, "", {}, makeForm({ intent: "read", roomId, messageId: latest.id })).then(onChange).catch(() => { latestReadRef.current = ""; }); }, 700);
    return () => clearTimeout(timer);
  }, [messages, settledSearch, scope, roomId, onChange, atBottom]);
  const updateDraft = (value: string) => { setDraft(value); drafts.set(roomId, value); nonceRef.current = null;
    try { if (value) sessionStorage.setItem(`chat-draft:${actor.key}:${roomId}`, value); else sessionStorage.removeItem(`chat-draft:${actor.key}:${roomId}`); } catch { /* Keep the in-memory draft. */ }
    if (value.trim() && room && canSendChatMessage(actor, room) && Date.now() - typingAtRef.current > 6000) { typingAtRef.current = Date.now(); void chatRequest(scope, "", {}, makeForm({ intent: "typing", roomId })).catch(() => {}); }
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault(); if (busy || (!draft.trim() && !file) || !room || !canSendChatMessage(actor, room)) return;
    setBusy(true); setSending(true); setError(""); const nonce = nonceRef.current ?? crypto.randomUUID(); nonceRef.current = nonce;
    const form = makeForm({ intent: "send", roomId, body: draft, nonce }); if (file) form.set("file", file);
    try { const result = await chatRequest<{ message: ChatMessage }>(scope, "", {}, form); setMessages(current => mergeChatMessages(current, [result.message])); setDraft(""); drafts.delete(roomId); try { sessionStorage.removeItem(`chat-draft:${actor.key}:${roomId}`); } catch {} setFile(null); nonceRef.current = null; setEmoji(false); nearBottomRef.current = true; onChange(); requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; composerRef.current?.focus({ preventScroll: true }); }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); setSending(false); }
  };
  const changeMessage = async (intent: "edit" | "delete", messageId: string, body = "") => {
    if (busy) return; setBusy(true); setError("");
    try { const result = await chatRequest<{ message: ChatMessage }>(scope, "", {}, makeForm({ intent, roomId, messageId, body })); setMessages(current => mergeChatMessages(current, [result.message])); setEdit(null); setDeleteId(null); setMenu(null); onChange(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const sendAllowed = Boolean(room && canSendChatMessage(actor, room));
  return <div className="chat-conversation">
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    <header className="chat-conversation-header"><Initials name={room ? chatIsStaff(actor) ? room.clientName : room.managerName ?? "Project manager" : "Conversation"} support={room?.kind === "support"} /><div className="chat-conversation-title"><h2>{room ? chatRoomTitle(actor, room) : "Conversation"}</h2><p>{room ? room.kind === "support" ? "Customer support" : room.managerActive ? `${room.managerName ?? "Your manager"} · Project manager` : "Manager not assigned" : "Loading conversation…"}</p></div><button className="chat-icon-button" aria-label={showSearch ? "Close message search" : "Search messages"} aria-expanded={showSearch} onClick={() => { setShowSearch(v => !v); setSearch(""); }}><Search size={19} /></button></header>
    {actor.admin && room?.kind === "manager" ? <ManagerAssignment scope={scope} room={room} onChange={onChange} /> : null}
    {showSearch ? <label className="chat-search chat-message-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search this conversation" placeholder="Search this conversation" autoFocus maxLength={120} value={search} onChange={e => setSearch(e.target.value)} /></label> : null}
    <div className="chat-timeline" ref={listRef} onScroll={event => { const list = event.currentTarget; nearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 70; setAtBottom(nearBottomRef.current); if (nearBottomRef.current) setHasNew(false); }} aria-label="Message history" aria-busy={loading}>
      {hasOlder ? <button className="chat-text-button chat-load-more" disabled={loadingOlder} onClick={() => { setLoadingOlder(true); void fetchHistory(true).catch(e => setError((e as Error).message)).finally(() => setLoadingOlder(false)); }}>{loadingOlder ? "Loading history…" : "Load older messages"}</button> : null}
      {loading ? <p className="chat-history-status" role="status">Loading conversation…</p> : null}
      {!loading && !messages.length ? <div className="chat-empty-thread"><span className="chat-empty-icon">{room?.kind === "support" ? <Headphones size={30} aria-hidden="true" /> : <MessageCircle size={30} aria-hidden="true" />}</span><h3>{settledSearch ? "No matching messages." : room?.kind === "support" ? "How can we help?" : room?.managerActive ? "Your next great edit starts here." : "Your manager will join you here."}</h3><p>{settledSearch ? "Try another word or clear your search." : room?.kind === "support" ? "Questions about your package, account, or a project? Send us a message." : room?.managerActive ? "Share an idea, ask a question, or talk through your project." : "Once your manager is assigned, you can plan your projects together. Customer support is available in your conversation list."}</p></div> : null}
      {messages.map((message, index) => { const own = message.actorKey === actor.key, day = new Date(message.createdAt).toLocaleDateString("en-US"), previousDay = messages[index - 1] ? new Date(messages[index - 1].createdAt).toLocaleDateString("en-US") : null;
        const seen = receipts.filter(r => r.lastReadAt > message.createdAt || (r.lastReadAt === message.createdAt && (r.lastReadId ?? "") >= message.id)); const download = `/api/chat?${new URLSearchParams({ scope, operation: "attachment", roomId, messageId: message.id })}`;
        return <div key={message.id}>{day !== previousDay ? <div className="chat-day">{new Date(message.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div> : null}
          <article className={`chat-message ${own ? "chat-message--own" : ""}`} aria-label={`Message from ${message.senderName}`}>
            {!own ? <span className="chat-sender">{message.senderName}<span>{chatRoleLabel(message.senderRole)}</span></span> : null}
            <div className={`chat-bubble ${message.deletedAt ? "chat-bubble--deleted" : ""}`}>
              {message.deletedAt ? <p>Message deleted</p> : <>{message.body ? <MessageBody body={message.body} /> : null}{message.attachment ? <a className="chat-attachment" href={download} target="_blank" rel="noopener noreferrer"><Paperclip size={18} aria-hidden="true" /><span>{message.attachment.name}<small>{(message.attachment.bytes / 1024).toFixed(0)} KB · Download</small></span></a> : null}</>}
            </div>
            <div className="chat-message-meta"><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>{message.editedAt && !message.deletedAt ? <span>Edited</span> : null}{own && !message.deletedAt ? <span className={`chat-delivery ${seen.length ? "is-read" : ""}`} title={seen.length ? `Read by ${seen.map(r => r.name).join(", ")}` : "Saved and sent"}>{seen.length ? <CheckCheck size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}<span className="sr-only">{seen.length ? "Read" : "Sent"}</span></span> : null}
              {own && !message.deletedAt ? <div className="chat-message-actions"><button className="chat-message-menu-trigger" aria-label="Message options" aria-expanded={menu === message.id} onClick={() => setMenu(menu === message.id ? null : message.id)}><MoreHorizontal size={16} /></button>{menu === message.id ? <div className="chat-message-menu">{message.body ? <button onClick={() => { setEdit(message); setEditBody(message.body); setMenu(null); }}>Edit message</button> : null}<button onClick={() => { setDeleteId(message.id); setMenu(null); }}>Delete message</button><button onClick={() => setMenu(null)}>Close</button></div> : null}</div> : null}
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
      <label className="sr-only" htmlFor="chat-draft">Message</label><textarea id="chat-draft" ref={composerRef} value={draft} rows={2} maxLength={4000} disabled={busy || !sendAllowed} placeholder={sendAllowed ? "Write a message…" : room?.clientActive === false ? "This client account is inactive" : "Waiting for your manager to be assigned"} onChange={e => updateDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
      <div className="chat-composer-tools"><div><input type="file" ref={fileRef} hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { const candidate = e.target.files?.[0]; e.target.value = ""; if (candidate) { if (candidate.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(candidate.type)) setError("Choose a JPG, PNG, WebP, or PDF up to 5 MB."); else { setFile(candidate); nonceRef.current = null; setError(""); } } }} /><button type="button" className="chat-icon-button" aria-label="Attach a file" title="JPG, PNG, WebP, or PDF · up to 5 MB" disabled={busy || !sendAllowed} onClick={() => fileRef.current?.click()}><Paperclip size={19} /></button><button type="button" className="chat-icon-button" aria-label="Choose an emoji" aria-expanded={emoji} disabled={busy || !sendAllowed} onClick={() => setEmoji(v => !v)}><Smile size={19} /></button><span className="chat-composer-hint">Shift + Enter for a new line</span></div><button className="chat-send" disabled={busy || !sendAllowed || (!draft.trim() && !file)}><span>{sending ? "Sending…" : "Send"}</span><Send size={17} aria-hidden="true" /></button></div>
    </form>}
    {deleteId ? <ChatDialog title="Delete this message?" onClose={() => !busy && setDeleteId(null)}><p>The message and its attachment will be removed for everyone in this conversation.</p><div className="chat-dialog-actions"><button className="chat-text-button" disabled={busy} onClick={() => setDeleteId(null)}>Keep message</button><button className="chat-primary-button" disabled={busy} onClick={() => void changeMessage("delete", deleteId)}>Delete message</button></div></ChatDialog> : null}
  </div>;
}

function ManagerAssignment({ room, scope, onChange }: { room: ChatRoom; scope: string; onChange: () => void }) {
  const [people, setPeople] = useState<ChatPerson[]>([]), [manager, setManager] = useState(room.managerId ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { const abort = new AbortController(); void chatRequest<{ managers: ChatPerson[] }>(scope, "people", {}, undefined, abort.signal).then(result => setPeople(result.managers)).catch(e => { if (!abort.signal.aborted) setError((e as Error).message); }); return () => abort.abort(); }, [scope]);
  useEffect(() => setManager(room.managerId ?? ""), [room.managerId]);
  return <form className="chat-assignment" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await chatRequest(scope, "", {}, makeForm({ intent: "assign", roomId: room.id, managerId: manager, expectedManagerId: room.managerId ?? "" })); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><label htmlFor="chat-manager">Project manager</label><div><select id="chat-manager" value={manager} disabled={busy || !room.clientActive} onChange={e => setManager(e.target.value)}><option value="">Not assigned</option>{room.managerId && !people.some(p => p.id === room.managerId) ? <option value={room.managerId}>Previous manager (unavailable)</option> : null}{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button disabled={busy || !room.clientActive || manager === (room.managerId ?? "")}>{busy ? "Saving…" : "Assign"}</button></div>{!people.length ? <p>Create an active account with the Project manager role to assign it here.</p> : null}{error ? <p role="alert">{error}</p> : null}</form>;
}
function ChatDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { ref.current?.close(); if (previous?.isConnected) previous.focus(); }; }, []);
  return <dialog ref={ref} className="chat-dialog" aria-labelledby="chat-dialog-title" onCancel={e => { e.preventDefault(); closeRef.current(); }}><div className="chat-dialog-heading"><h2 id="chat-dialog-title">{title}</h2><button className="chat-icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
function NewConversation({ scope, onClose, onCreated }: { scope: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [search, setSearch] = useState(""), [clients, setClients] = useState<ChatPerson[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""); const settled = useDebounced(search);
  useEffect(() => { const abort = new AbortController(); void chatRequest<{ clients: ChatPerson[] }>(scope, "people", { search: settled }, undefined, abort.signal).then(result => setClients(result.clients)).catch(e => { if (!abort.signal.aborted) setError((e as Error).message); }); return () => abort.abort(); }, [scope, settled]);
  return <ChatDialog title="Start a client conversation" onClose={() => !busy && onClose()}><p>Open the client’s manager and support rooms, then assign their project manager.</p><label className="chat-search"><Search size={17} aria-hidden="true" /><input autoFocus type="search" aria-label="Find a client" placeholder="Find a client by name or email" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} /></label><div className="chat-client-options">{clients.map(client => <button key={client.id} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const result = await chatRequest<{ rooms: { id: string; kind: string }[] }>(scope, "", {}, makeForm({ intent: "create", clientId: client.id })); onCreated(result.rooms.find(r => r.kind === "manager")?.id ?? result.rooms[0].id); } catch (e) { setError((e as Error).message); setBusy(false); } }}><Initials name={client.name} /><span>{client.name}<small>{client.email}</small></span><MessageCircle size={17} aria-hidden="true" /></button>)}{!clients.length ? <p>No active clients match. Try another name or email.</p> : null}</div>{error ? <p role="alert" className="chat-conversation-error">{error}</p> : null}</ChatDialog>;
}
