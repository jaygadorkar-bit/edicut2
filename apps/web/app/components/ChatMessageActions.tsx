import { useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { canDeleteChatMessage, canModerateChat, canSendChatMessage, type ChatActor, type ChatMessage, type ChatRoom } from "../lib/chat";

export function ChatMessageActions({ actor, room, message, pending, disabled, onEdit, onDelete, onRemoveAttachment }: {
  actor: ChatActor; room?: ChatRoom; message: ChatMessage; pending?: boolean; disabled?: boolean;
  onEdit: (trigger: HTMLElement | null) => void; onDelete: (trigger: HTMLElement | null) => void; onRemoveAttachment: (trigger: HTMLElement | null) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  if (!room || pending || !canDeleteChatMessage(actor, room, message)) return null;
  const canEdit = message.actorKey === actor.key && Boolean(message.body) && canSendChatMessage(actor, room);
  function choose(action?: (trigger: HTMLElement | null) => void) {
    const details = detailsRef.current;
    const trigger = details?.querySelector("summary") ?? null;
    if (details) {
      details.open = false;
      trigger?.focus();
    }
    action?.(trigger);
  }
  return <details ref={detailsRef} className="chat-message-actions" name="chat-message-actions" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); choose(); }
  }}>
    <summary className="chat-message-menu-trigger" aria-label="Message options" title="Message options"><MoreHorizontal size={18} aria-hidden="true" /></summary>
    <div className="chat-message-menu">
      {canEdit ? <button type="button" aria-label="Edit message" disabled={disabled} onClick={() => choose(onEdit)}>Edit message</button> : null}
      {canModerateChat(actor) && message.attachment ? <button type="button" aria-label="Remove attachment" className="chat-message-menu__destructive" disabled={disabled} onClick={() => choose(onRemoveAttachment)}>Remove attachment</button> : null}
      <button type="button" aria-label="Delete message" className="chat-message-menu__destructive" disabled={disabled} onClick={() => choose(onDelete)}>Delete message</button>
      <button type="button" onClick={() => choose()}>Close</button>
    </div>
  </details>;
}
