CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"actor_key" varchar(48) NOT NULL,
	"sender_user_id" uuid,
	"sender_admin_id" uuid,
	"sender_name" text NOT NULL,
	"sender_role" varchar(32) NOT NULL,
	"body" text NOT NULL,
	"attachment" jsonb,
	"edited_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"client_nonce" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_body_check" CHECK (char_length(btrim("chat_messages"."body")) BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "chat_reads" (
	"room_id" uuid NOT NULL,
	"actor_key" varchar(48) NOT NULL,
	"last_read_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"manager_id" uuid,
	"last_message_at" timestamp (3) with time zone,
	"last_message_preview" varchar(180),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_rooms_kind_check" CHECK ("chat_rooms"."kind" IN ('manager', 'support') AND ("chat_rooms"."kind" = 'manager' OR "chat_rooms"."manager_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_admin_id_admin_users_id_fk" FOREIGN KEY ("sender_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_actor_nonce_idx" ON "chat_messages" USING btree ("actor_key","client_nonce");--> statement-breakpoint
CREATE INDEX "chat_messages_room_created_idx" ON "chat_messages" USING btree ("room_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reads_room_actor_idx" ON "chat_reads" USING btree ("room_id","actor_key");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_rooms_client_kind_idx" ON "chat_rooms" USING btree ("client_id","kind");--> statement-breakpoint
CREATE INDEX "chat_rooms_manager_updated_idx" ON "chat_rooms" USING btree ("manager_id","updated_at");--> statement-breakpoint
CREATE INDEX "chat_rooms_updated_idx" ON "chat_rooms" USING btree ("updated_at");