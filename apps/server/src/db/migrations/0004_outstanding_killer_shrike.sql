CREATE TABLE "action_item_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_hash" varchar(64) NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_item_completions_hash_user_unique" UNIQUE("item_hash","user_id")
);
--> statement-breakpoint
ALTER TABLE "action_item_completions" ADD CONSTRAINT "action_item_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_item_completions_account_id_idx" ON "action_item_completions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "action_item_completions_user_id_idx" ON "action_item_completions" USING btree ("user_id");