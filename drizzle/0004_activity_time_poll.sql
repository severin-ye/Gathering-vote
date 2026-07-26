CREATE TABLE "activity_time_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"hour" integer NOT NULL,
	"minute" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_time_options_hour_check" CHECK ("activity_time_options"."hour" between 0 and 23),
	CONSTRAINT "activity_time_options_minute_check" CHECK ("activity_time_options"."minute" between 0 and 59)
);
--> statement-breakpoint
CREATE TABLE "activity_time_votes" (
	"activity_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_time_votes_option_id_user_id_pk" PRIMARY KEY("option_id","user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "activity_time_options_activity_id_id_unique" ON "activity_time_options" USING btree ("activity_id","id");--> statement-breakpoint
ALTER TABLE "activity_time_options" ADD CONSTRAINT "activity_time_options_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_time_options" ADD CONSTRAINT "activity_time_options_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_time_votes" ADD CONSTRAINT "activity_time_votes_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_time_votes" ADD CONSTRAINT "activity_time_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_time_votes" ADD CONSTRAINT "activity_time_votes_activity_option_fk" FOREIGN KEY ("activity_id","option_id") REFERENCES "public"."activity_time_options"("activity_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_time_options_time_unique" ON "activity_time_options" USING btree ("activity_id","hour","minute");--> statement-breakpoint
CREATE INDEX "activity_time_options_activity_idx" ON "activity_time_options" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "activity_time_votes_activity_user_idx" ON "activity_time_votes" USING btree ("activity_id","user_id");
