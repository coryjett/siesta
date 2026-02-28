ALTER TABLE "team_resources" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "team_resources" ADD COLUMN "type" varchar(10) DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_resources" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "team_resources" ADD COLUMN "file_data" "bytea";--> statement-breakpoint
ALTER TABLE "team_resources" ADD COLUMN "file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "team_resources" ADD COLUMN "file_mime_type" varchar(255);--> statement-breakpoint
ALTER TABLE "team_resources" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "team_resources" ADD COLUMN "tags" text[] DEFAULT '{}';