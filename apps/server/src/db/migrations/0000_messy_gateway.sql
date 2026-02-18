CREATE TYPE "public"."user_role" AS ENUM('se', 'se_manager', 'admin');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('task', 'event');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gong_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gong_id" varchar(255) NOT NULL,
	"title" varchar(1024),
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"started" timestamp with time zone,
	"duration" integer,
	"direction" varchar(50),
	"scope" varchar(255),
	"media" varchar(50),
	"language" varchar(10),
	"url" varchar(2048),
	"account_sf_id" varchar(18),
	"account_id" uuid,
	"opportunity_sf_id" varchar(18),
	"opportunity_id" uuid,
	"participants" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gong_calls_gong_id_unique" UNIQUE("gong_id")
);
--> statement-breakpoint
CREATE TABLE "gong_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"full_text" text NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', full_text)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gong_transcripts_call_id_unique" UNIQUE("call_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'se' NOT NULL,
	"sf_user_id" varchar(18),
	"avatar_url" varchar(1024),
	"google_sub" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sf_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sf_id" varchar(18) NOT NULL,
	"name" varchar(255) NOT NULL,
	"industry" varchar(255),
	"website" varchar(1024),
	"annual_revenue" numeric(18, 2),
	"number_of_employees" integer,
	"billing_city" varchar(255),
	"billing_state" varchar(255),
	"billing_country" varchar(255),
	"type" varchar(255),
	"owner_id" varchar(18),
	"owner_name" varchar(255),
	"description" text,
	"last_activity_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sf_accounts_sf_id_unique" UNIQUE("sf_id")
);
--> statement-breakpoint
CREATE TABLE "sf_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sf_id" varchar(18) NOT NULL,
	"name" varchar(255) NOT NULL,
	"account_sf_id" varchar(18),
	"account_id" uuid,
	"stage_name" varchar(255) NOT NULL,
	"amount" numeric(18, 2),
	"close_date" timestamp with time zone NOT NULL,
	"probability" numeric(5, 2),
	"type" varchar(255),
	"lead_source" varchar(255),
	"next_step" text,
	"description" text,
	"is_closed" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"owner_id" varchar(18),
	"owner_name" varchar(255),
	"assigned_se_sf_id" varchar(18),
	"assigned_se_user_id" uuid,
	"last_activity_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sf_opportunities_sf_id_unique" UNIQUE("sf_id")
);
--> statement-breakpoint
CREATE TABLE "sf_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sf_id" varchar(18) NOT NULL,
	"account_sf_id" varchar(18),
	"account_id" uuid,
	"first_name" varchar(255),
	"last_name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"title" varchar(255),
	"department" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sf_contacts_sf_id_unique" UNIQUE("sf_id")
);
--> statement-breakpoint
CREATE TABLE "sf_opp_contact_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sf_id" varchar(18) NOT NULL,
	"opportunity_sf_id" varchar(18) NOT NULL,
	"opportunity_id" uuid,
	"contact_sf_id" varchar(18) NOT NULL,
	"contact_id" uuid,
	"role" varchar(255),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sf_opp_contact_roles_sf_id_unique" UNIQUE("sf_id")
);
--> statement-breakpoint
CREATE TABLE "sf_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sf_id" varchar(18) NOT NULL,
	"account_sf_id" varchar(18),
	"account_id" uuid,
	"opportunity_sf_id" varchar(18),
	"opportunity_id" uuid,
	"subject" varchar(255),
	"description" text,
	"activity_type" "activity_type" NOT NULL,
	"activity_date" timestamp with time zone,
	"status" varchar(255),
	"priority" varchar(255),
	"is_completed" boolean DEFAULT false NOT NULL,
	"owner_id" varchar(18),
	"owner_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sf_activities_sf_id_unique" UNIQUE("sf_id")
);
--> statement-breakpoint
CREATE TABLE "sf_opportunity_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_name" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sf_opportunity_stages_stage_name_unique" UNIQUE("stage_name")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"account_id" uuid,
	"opportunity_id" uuid,
	"content_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_html" text NOT NULL,
	"content_plain_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"provider" varchar(50) PRIMARY KEY NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_type" varchar(50),
	"instance_url" varchar(1024),
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"provider" varchar(50) NOT NULL,
	"entity" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'idle' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"records_processed" integer,
	"cursor" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_state_provider_entity_pk" PRIMARY KEY("provider","entity")
);
--> statement-breakpoint
CREATE TABLE "user_google_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gong_calls" ADD CONSTRAINT "gong_calls_account_id_sf_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sf_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gong_calls" ADD CONSTRAINT "gong_calls_opportunity_id_sf_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sf_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gong_transcripts" ADD CONSTRAINT "gong_transcripts_call_id_gong_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."gong_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sf_opportunities" ADD CONSTRAINT "sf_opportunities_account_id_sf_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sf_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sf_opportunities" ADD CONSTRAINT "sf_opportunities_assigned_se_user_id_users_id_fk" FOREIGN KEY ("assigned_se_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sf_contacts" ADD CONSTRAINT "sf_contacts_account_id_sf_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sf_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sf_opp_contact_roles" ADD CONSTRAINT "sf_opp_contact_roles_opportunity_id_sf_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sf_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sf_opp_contact_roles" ADD CONSTRAINT "sf_opp_contact_roles_contact_id_sf_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."sf_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sf_activities" ADD CONSTRAINT "sf_activities_account_id_sf_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sf_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sf_activities" ADD CONSTRAINT "sf_activities_opportunity_id_sf_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sf_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_account_id_sf_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sf_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_opportunity_id_sf_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sf_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_google_tokens" ADD CONSTRAINT "user_google_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gong_calls_gong_id_idx" ON "gong_calls" USING btree ("gong_id");--> statement-breakpoint
CREATE INDEX "gong_calls_account_id_idx" ON "gong_calls" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "gong_calls_opportunity_id_idx" ON "gong_calls" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "gong_calls_started_idx" ON "gong_calls" USING btree ("started");--> statement-breakpoint
CREATE INDEX "gong_transcripts_search_vector_idx" ON "gong_transcripts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "gong_transcripts_full_text_trgm_idx" ON "gong_transcripts" USING gin ("full_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sf_accounts_sf_id_idx" ON "sf_accounts" USING btree ("sf_id");--> statement-breakpoint
CREATE INDEX "sf_accounts_name_idx" ON "sf_accounts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sf_opportunities_sf_id_idx" ON "sf_opportunities" USING btree ("sf_id");--> statement-breakpoint
CREATE INDEX "sf_opportunities_account_id_idx" ON "sf_opportunities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sf_opportunities_stage_name_idx" ON "sf_opportunities" USING btree ("stage_name");--> statement-breakpoint
CREATE INDEX "sf_opportunities_assigned_se_idx" ON "sf_opportunities" USING btree ("assigned_se_user_id");--> statement-breakpoint
CREATE INDEX "sf_opportunities_close_date_idx" ON "sf_opportunities" USING btree ("close_date");--> statement-breakpoint
CREATE INDEX "sf_contacts_sf_id_idx" ON "sf_contacts" USING btree ("sf_id");--> statement-breakpoint
CREATE INDEX "sf_contacts_account_id_idx" ON "sf_contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sf_opp_contact_roles_opp_id_idx" ON "sf_opp_contact_roles" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "sf_opp_contact_roles_contact_id_idx" ON "sf_opp_contact_roles" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sf_activities_account_id_idx" ON "sf_activities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sf_activities_opportunity_id_idx" ON "sf_activities" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "sf_activities_activity_date_idx" ON "sf_activities" USING btree ("activity_date");--> statement-breakpoint
CREATE INDEX "notes_author_id_idx" ON "notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "notes_account_id_idx" ON "notes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notes_opportunity_id_idx" ON "notes" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "notes_created_at_idx" ON "notes" USING btree ("created_at");