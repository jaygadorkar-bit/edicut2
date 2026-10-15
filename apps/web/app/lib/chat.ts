export type ChatActor = { id: string; key: string; name: string; role: string; admin: boolean };
export const TICKET_CATEGORIES = { billing: "Billing & payment", subscription: "Subscription & package", project: "Project or delivery", technical: "Technical problem", account: "Account & access", other: "Something else" } as const;
export const TICKET_STATUSES = { waiting_support: "Awaiting support", waiting_customer: "Awaiting customer", closed: "Closed" } as const;
export const TICKET_PRIORITIES = { low: "Low", normal: "Normal", high: "High" } as const;
export type TicketCategory = keyof typeof TICKET_CATEGORIES;
export type TicketStatus = keyof typeof TICKET_STATUSES;
export type TicketPriority = keyof typeof TICKET_PRIORITIES;
export type SupportTicket = { number: number; subject: string; category: TicketCategory; priority: TicketPriority; status: TicketStatus; closedAt: string | null; updatedAt: string };
export type ChatView = "projects" | "tickets";
export type ChatParticipant = { key: string; name: string; role: string; avatarUrl: string | null; lastActiveAt: string | null };
export type ChatRoom = {
  id: string; clientId: string; clientName: string; clientEmail: string | null; clientActive: boolean;
  kind: "manager" | "support"; managerId: string | null; managerName: string | null;
  managerActive: boolean; lastMessageAt: string | null; lastMessagePreview: string | null;
  lastMessageActorKey?: string | null; lastMessageRead?: boolean;
  participants?: ChatParticipant[];
  updatedAt: string; unreadCount: number;
  projectUnlocked: boolean; ticket: SupportTicket | null;
};
export type ChatAttachment = { publicId: string; name: string; mime: string; bytes: number };
export type ChatMessage = { id: string; roomId: string; actorKey: string; senderName: string; senderRole: string; body: string; clientNonce: string; createdAt: string; editedAt: string | null; deletedAt: string | null; attachment: ChatAttachment | null };
export function sanitizeChatMessageBody(actorKey: string, body: string) {
  return actorKey === "system:assignment" ? body.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "Project manager") : body;
}
export type ChatReceipt = { actorKey: string; name: string; role: string; lastReadAt: string; lastReadId: string | null };
export type ChatPerson = { id: string; name: string; email: string };
export type ChatState = { rooms: ChatRoom[]; hasMore: boolean; page: number; ready: boolean; ticketCounts?: Record<TicketStatus | "all", number> };
export type ChatUnreadCounts = { projects: number; tickets: number };
export type ChatHistory = { room: ChatRoom; messages: ChatMessage[]; hasOlder: boolean; receipts: ChatReceipt[] };
export type ChatSnapshot = { state: ChatState; unread: ChatUnreadCounts; history: ChatHistory | null; historyUnavailable: boolean };
export const CHAT_MESSAGE_LIMIT = 4000;
export const CHAT_PAGE_SIZE = 40;
export const CHAT_HISTORY_SIZE = 50;
export const chatId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const chatIsStaff = (actor: ChatActor) => actor.admin || ["project_manager", "customer_support"].includes(actor.role);
export function canReadChatRoom(actor: ChatActor, room: ChatRoom) {
  if (actor.admin) return room.kind === "support" ? Boolean(room.ticket) : room.projectUnlocked;
  if (!room.clientActive) return false;
  if (actor.role === "project_manager") return room.kind === "manager" && room.projectUnlocked && room.managerId === actor.id && room.managerActive;
  if (actor.role === "customer_support") return room.kind === "support" && Boolean(room.ticket);
  return room.clientId === actor.id && (room.kind === 'manager' || Boolean(room.ticket));
}
export function canSendChatMessage(actor: ChatActor, room: ChatRoom) {
  return canReadChatRoom(actor, room) && room.clientActive && (room.kind === "support" ? Boolean(room.ticket && room.ticket.status !== "closed") : room.projectUnlocked);
}
export function validateSupportTicket(subject: string, category: string, body: string, priority: string, nonce: string) {
  if (subject.trim().length < 3 || subject.trim().length > 160) return "Give your ticket a subject between 3 and 160 characters.";
  if (!Object.hasOwn(TICKET_CATEGORIES, category)) return "Choose the type of issue you need help with.";
  if (!Object.hasOwn(TICKET_PRIORITIES, priority)) return "Choose a valid priority.";
  return validateChatMessage(body, nonce);
}
export function validateChatMessage(body: unknown, nonce: unknown, attachment = false) {
  if (typeof body !== "string" || (!body.trim() && !attachment) || body.trim().length > CHAT_MESSAGE_LIMIT) return "Write a message between 1 and 4,000 characters, or attach a file.";
  if (!chatId(nonce)) return "Refresh this page before sending your message.";
  return null;
}
export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map([...existing, ...incoming].map(message => [message.id, message]));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function chatRoomTitle(actor: ChatActor, room: ChatRoom) {
  return room.ticket ? room.ticket.subject : chatIsStaff(actor) ? room.clientName : "Project group";
}
export const chatSenderName = (role: string, name: string | null | undefined) => {
  if (role === "admin") return "EdiCut Admin";
  const displayName = name?.trim() ?? "";
  if (displayName && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayName)) return displayName;
  return role === "project_manager" ? "Project manager" : role === "customer_support" ? "Customer support" : "Client";
};
/** A client nonce identifies one immutable send payload; generated storage IDs may differ on a retry. */
export function chatMessagePayloadMatches(message: Pick<ChatMessage, "body" | "attachment">, body: string, attachment: Pick<ChatAttachment, "name" | "mime" | "bytes"> | null) {
  if (message.body !== body) return false;
  if (!message.attachment || !attachment) return message.attachment === null && attachment === null;
  return message.attachment.name === attachment.name && message.attachment.mime === attachment.mime && message.attachment.bytes === attachment.bytes;
}
export const chatRoleLabel = (role: string) => ({ admin: "Admin", project_manager: "Project manager", customer_support: "Support" }[role] ?? "Client");
export function formatChatLastActive(value: string | null, now = Date.now()) {
  if (!value) return "No activity yet";
  const elapsed = Math.max(0, now - Date.parse(value));
  if (!Number.isFinite(elapsed)) return "No activity yet";
  if (elapsed < 60_000) return "Active now";
  if (elapsed < 3_600_000) return `Active ${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `Active ${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 604_800_000) return `Active ${Math.floor(elapsed / 86_400_000)}d ago`;
  return `Last active ${new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
export function isChatParticipantRecentlyActive(value: string | null, now = Date.now()) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  const elapsed = now - timestamp;
  return Number.isFinite(timestamp) && elapsed >= 0 && elapsed < 6 * 60_000;
}
