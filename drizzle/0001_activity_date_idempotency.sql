ALTER TABLE "activities" ADD COLUMN "event_date" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "client_request_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_client_request_id_unique" ON "activities" USING btree ("client_request_id");