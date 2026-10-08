ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_body_check";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_check" CHECK (char_length("chat_messages"."body") <= 4000 AND (char_length(btrim("chat_messages"."body")) > 0 OR "chat_messages"."attachment" IS NOT NULL OR "chat_messages"."deleted_at" IS NOT NULL));
--> statement-breakpoint
-- Chat data is available only through the application's authorized server API.
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chat_rooms, chat_messages, chat_reads FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON chat_rooms, chat_messages, chat_reads FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON chat_rooms, chat_messages, chat_reads FROM authenticated;
  END IF;
END $$;
