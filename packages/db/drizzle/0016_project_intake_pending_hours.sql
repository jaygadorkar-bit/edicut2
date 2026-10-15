-- Monthly briefs start with no hours reserved; editors confirm scope after review.
ALTER TABLE "project_intakes" DROP CONSTRAINT "project_intakes_reserved_check";
--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_reserved_check" CHECK ("reserved_units" >= 0);
