ALTER TABLE "users" ADD COLUMN "keycloak_sub" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_keycloak_sub_unique" UNIQUE("keycloak_sub");--> statement-breakpoint
ALTER TABLE "user_mcp_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_mcp_tokens" CASCADE;
