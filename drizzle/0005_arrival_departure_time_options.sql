DROP INDEX "activity_time_options_time_unique";--> statement-breakpoint
ALTER TABLE "activity_time_options" ADD COLUMN "kind" text DEFAULT 'arrival' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_time_options_time_unique" ON "activity_time_options" USING btree ("activity_id","kind","hour","minute");--> statement-breakpoint
ALTER TABLE "activity_time_options" ADD CONSTRAINT "activity_time_options_kind_check" CHECK ("activity_time_options"."kind" in ('arrival', 'departure'));