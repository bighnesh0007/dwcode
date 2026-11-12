ALTER TABLE "contests" ADD COLUMN "series_key" text;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_series_key_unique" UNIQUE("series_key");