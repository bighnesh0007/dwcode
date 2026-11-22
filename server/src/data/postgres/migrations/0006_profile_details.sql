CREATE TABLE "profile_details" (
	"user_id" text PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"equipped" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mentor_active" boolean DEFAULT false NOT NULL,
	"mentor_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mentor_note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "profile_details_mentor_idx" ON "profile_details" USING btree ("mentor_active","updated_at");