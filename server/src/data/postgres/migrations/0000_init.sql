CREATE TYPE "public"."comment_target" AS ENUM('problem', 'blog');--> statement-breakpoint
CREATE TYPE "public"."contest_status" AS ENUM('upcoming', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('Easy', 'Medium', 'Hard', 'Expert');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('wrong-expected-output', 'unclear-description', 'broken-test-case', 'duplicate', 'inappropriate', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('Accepted', 'Attempted', 'Error');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "blog_votes" (
	"blog_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_votes_blog_id_user_id_pk" PRIMARY KEY("blog_id","user_id"),
	CONSTRAINT "blog_votes_value" CHECK ("blog_votes"."value" in (1, -1))
);
--> statement-breakpoint
CREATE TABLE "blogs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text DEFAULT 'Anonymous' NOT NULL,
	"author_image_url" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blogs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"user_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_problem_id_pk" PRIMARY KEY("user_id","problem_id")
);
--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" "comment_target" NOT NULL,
	"target_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_image_url" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest_participants" (
	"contest_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_image_url" text DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"solved_problem_slugs" text[] DEFAULT '{}' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "contest_participants_contest_id_user_id_pk" PRIMARY KEY("contest_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "contest_problems" (
	"contest_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "contest_problems_contest_id_problem_id_pk" PRIMARY KEY("contest_id","problem_id")
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "contest_status" DEFAULT 'upcoming' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"max_participants" integer DEFAULT 100 NOT NULL,
	"invite_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contests_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "contests_time_order" CHECK ("contests"."end_time" > "contests"."start_time")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"followed_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followed_id_pk" PRIMARY KEY("follower_id","followed_id"),
	CONSTRAINT "follows_not_self" CHECK ("follows"."follower_id" <> "follows"."followed_id")
);
--> statement-breakpoint
CREATE TABLE "github_integrations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"github_id" text NOT NULL,
	"github_username" text NOT NULL,
	"access_token" text NOT NULL,
	"repo_name" text DEFAULT 'dwcode-workspace' NOT NULL,
	"repo_private" boolean DEFAULT false NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"user_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_user_id_problem_id_pk" PRIMARY KEY("user_id","problem_id"),
	CONSTRAINT "notes_content_length" CHECK (char_length("notes"."content") <= 20000)
);
--> statement-breakpoint
CREATE TABLE "playground_snippets" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"script" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"test_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playground_snippets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "problem_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"problem_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text DEFAULT 'Anonymous' NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"description" text NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"constraints" text[] DEFAULT '{}' NOT NULL,
	"starter_code" text DEFAULT '%dw 2.0
output application/json
---
' NOT NULL,
	"test_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hidden_test_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"solution" text,
	"hints" text[] DEFAULT '{}' NOT NULL,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "store_purchases" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"cost" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_purchases_user_id_item_id_pk" PRIMARY KEY("user_id","item_id"),
	CONSTRAINT "store_purchases_cost_non_negative" CHECK ("store_purchases"."cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"problem_id" text NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	"user_name" text DEFAULT 'Anonymous' NOT NULL,
	"user_image_url" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"input" text DEFAULT '{}' NOT NULL,
	"output" text DEFAULT '' NOT NULL,
	"status" "submission_status" DEFAULT 'Attempted' NOT NULL,
	"execution_time" text DEFAULT '0ms' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"user_name" text DEFAULT '' NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"granted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_votes" ADD CONSTRAINT "blog_votes_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blogs_published_created_idx" ON "blogs" USING btree ("published","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "blogs_author_idx" ON "blogs" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "coin_transactions_user_created_idx" ON "coin_transactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_target_created_idx" ON "comments" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contest_participants_user_idx" ON "contest_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contests_public_start_idx" ON "contests" USING btree ("is_public","start_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "contests_created_by_idx" ON "contests" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "follows_followed_idx" ON "follows" USING btree ("followed_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_reports_one_open_idx" ON "problem_reports" USING btree ("problem_id","user_id") WHERE "problem_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "problem_reports_status_created_idx" ON "problem_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "problems_difficulty_category_idx" ON "problems" USING btree ("difficulty","category");--> statement-breakpoint
CREATE INDEX "problems_created_at_idx" ON "problems" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_user_created_idx" ON "submissions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_user_problem_status_idx" ON "submissions" USING btree ("user_id","problem_id","status");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");