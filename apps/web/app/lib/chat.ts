export type ChatActor = { id: string; key: string; name: string; role: string; admin: boolean };
export type ChatRoom = {
  id: string; clientId: string; clientName: string; clientEmail: string; clientActive: boolean;
  kind: "manager" | "support"; managerId: string | null; managerName: string | null;
  managerActive: boolean; lastMessageAt: string | null; lastMessagePreview: string | null;
  updatedAt: string; unreadCount: number;
};
export type ChatAttachment = { publicId: string; name: string; mime: string; bytes: number };
export type ChatMessage = { id: string; roomId: string; actorKey: string; senderName: string; senderRole: string; body: string; clientNonce: string; createdAt: string; editedAt: string | null; deletedAt: string | null; attachment: ChatAttachment | null };
export type ChatReceipt = { actorKey: string; name: string; role: string; lastReadAt: string; lastReadId: string | null };
export type ChatPerson = { id: string; name: string; email: string };
export type ChatState = { rooms: ChatRoom[]; hasMore: boolean; page: number; ready: boolean };
export const CHAT_MESSAGE_LIMIT = 4000;
export const CHAT_PAGE_SIZE = 40;
export const CHAT_HISTORY_SIZE = 50;
export const chatId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const chatIsStaff = (actor: ChatActor) => actor.admin || ["project_manager", "customer_support"].includes(actor.role);
export function canReadChatRoom(actor: ChatActor, room: ChatRoom) {
  if (actor.admin) return true;
  if (!room.clientActive) return false;
  if (actor.role === "project_manager") return room.kind === "manager" && room.managerId === actor.id && room.managerActive;
  if (actor.role === "customer_support") return room.kind === "support";
  return room.clientId === actor.id;
}
export function canSendChatMessage(actor: ChatActor, room: ChatRoom) {
  return canReadChatRoom(actor, room) && room.clientActive && (actor.admin || room.kind === "support" || room.managerActive);
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
  return chatIsStaff(actor) ? room.clientName : room.kind === "support" ? "Customer support" : "Your project manager";
}
export const chatRoleLabel = (role: string) => ({ admin: "Admin", project_manager: "Project manager", customer_support: "Support" }[role] ?? "Client");
