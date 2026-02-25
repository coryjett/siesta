CREATE TABLE "user_mcp_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_account_id_sf_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_opportunity_id_sf_opportunities_id_fk";
--> statement-breakpoint
ALTER TABLE "gong_calls" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gong_transcripts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sf_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sf_opportunities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sf_contacts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sf_opp_contact_roles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sf_activities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sf_opportunity_stages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_state" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "gong_calls" CASCADE;--> statement-breakpoint
DROP TABLE "gong_transcripts" CASCADE;--> statement-breakpoint
DROP TABLE "sf_accounts" CASCADE;--> statement-breakpoint
DROP TABLE "sf_opportunities" CASCADE;--> statement-breakpoint
DROP TABLE "sf_contacts" CASCADE;--> statement-breakpoint
DROP TABLE "sf_opp_contact_roles" CASCADE;--> statement-breakpoint
DROP TABLE "sf_activities" CASCADE;--> statement-breakpoint
DROP TABLE "sf_opportunity_stages" CASCADE;--> statement-breakpoint
DROP TABLE "oauth_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "sync_state" CASCADE;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "account_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "opportunity_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "user_mcp_tokens" ADD CONSTRAINT "user_mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."activity_type";
