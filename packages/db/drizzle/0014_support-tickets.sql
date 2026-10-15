CREATE TABLE "support_tickets" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"ticket_number" serial NOT NULL,
	"subject" varchar(160) NOT NULL,
	"category" varchar(32) NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"status" varchar(24) DEFAULT 'waiting_support' NOT NULL,
	"closed_at" timestamp (3) with time zone,
	"closed_by" varchar(48),
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number"),
	CONSTRAINT "support_tickets_subject_check" CHECK (char_length(btrim("support_tickets"."subject")) BETWEEN 3 AND 160),
	CONSTRAINT "support_tickets_category_check" CHECK ("support_tickets"."category" IN ('billing', 'subscription', 'project', 'technical', 'account', 'other')),
	CONSTRAINT "support_tickets_priority_check" CHECK ("support_tickets"."priority" IN ('low', 'normal', 'high')),
	CONSTRAINT "support_tickets_status_check" CHECK ("support_tickets"."status" IN ('waiting_support', 'waiting_customer', 'closed')),
	CONSTRAINT "support_tickets_closed_check" CHECK (("support_tickets"."status" = 'closed' AND "support_tickets"."closed_at" IS NOT NULL AND "support_tickets"."closed_by" IS NOT NULL) OR ("support_tickets"."status" <> 'closed' AND "support_tickets"."closed_at" IS NULL AND "support_tickets"."closed_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "chat_rooms_client_kind_idx";--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_tickets_status_updated_idx" ON "support_tickets" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_rooms_manager_client_idx" ON "chat_rooms" USING btree ("client_id") WHERE "chat_rooms"."kind" = 'manager';--> statement-breakpoint
CREATE INDEX "chat_rooms_client_updated_idx" ON "chat_rooms" USING btree ("client_id","updated_at");
--> statement-breakpoint
REVOKE ALL ON support_tickets FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_tickets_ticket_number_seq FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON support_tickets FROM anon;
    REVOKE ALL ON SEQUENCE support_tickets_ticket_number_seq FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON support_tickets FROM authenticated;
    REVOKE ALL ON SEQUENCE support_tickets_ticket_number_seq FROM authenticated;
  END IF;
END $$;
--> statement-breakpoint
-- Preserve any existing support history as one ticket; keep empty rooms stored.
INSERT INTO support_tickets (room_id, subject, category, status, updated_at)
SELECT r.id, 'Existing support conversation', 'other',
  CASE WHEN latest.sender_role IN ('admin', 'customer_support') THEN 'waiting_customer' ELSE 'waiting_support' END,
  r.updated_at
FROM chat_rooms r JOIN LATERAL (
  SELECT sender_role FROM chat_messages WHERE room_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1
) latest ON true WHERE r.kind = 'support';
