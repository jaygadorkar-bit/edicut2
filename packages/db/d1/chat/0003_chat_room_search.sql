ALTER TABLE chat_rooms ADD COLUMN search_preview TEXT NOT NULL DEFAULT '';
ALTER TABLE support_tickets ADD COLUMN search_subject TEXT NOT NULL DEFAULT '';
UPDATE chat_rooms SET search_preview=lower(COALESCE(last_message_preview,''));
UPDATE support_tickets SET search_subject=lower(subject);
