CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"author_id" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"check" jsonb,
	"review_note" text DEFAULT '' NOT NULL,
	"reviewed_by" text DEFAULT '' NOT NULL,
	"published_ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contributions_author_idx" ON "contributions" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "contributions_status_idx" ON "contributions" USING btree ("status","kind","created_at");