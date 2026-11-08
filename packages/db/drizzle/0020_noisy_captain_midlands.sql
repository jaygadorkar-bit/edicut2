CREATE INDEX IF NOT EXISTS "contact_messages_status_created_idx" ON "contact_messages" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_owner_id_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_featured_sort_idx" ON "projects" USING btree ("featured","sort_order");
