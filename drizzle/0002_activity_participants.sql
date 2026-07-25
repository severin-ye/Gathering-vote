CREATE TABLE "activity_participants" (
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_participants_activity_id_user_id_pk" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_participants_activity_idx" ON "activity_participants" USING btree ("activity_id");--> statement-breakpoint
INSERT INTO "activity_participants" ("activity_id", "user_id", "joined_at")
SELECT "activity_id", "user_id", "updated_at"
FROM "ballots"
ON CONFLICT ("activity_id", "user_id") DO NOTHING;
