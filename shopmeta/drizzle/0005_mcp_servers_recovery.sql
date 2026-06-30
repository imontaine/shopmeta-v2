-- Migration 0005: Ensure mcp_servers has all columns from 0004 (recovery migration).
--
-- Context: Migration 0004 may have been recorded as "applied" in the drizzle migrations
-- table even if the ALTER TABLE statements failed (e.g., due to the DO $$ END $$ blocks
-- running inside a transaction that was partially rolled back, or if the migration runner
-- marked it complete before the ALTER statements executed).
--
-- This migration re-applies all column additions using plain ALTER TABLE ... ADD COLUMN IF
-- NOT EXISTS (supported in PostgreSQL 9.6+), which is idempotent and safe to run multiple times.

-- Ensure mcp_servers table exists (in case neither 0003 nor 0004 ran)
CREATE TABLE IF NOT EXISTS "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"server_name" text NOT NULL,
	"url" text NOT NULL,
	"transport" text DEFAULT 'streamable-http' NOT NULL,
	"description" text,
	"icon_url" text,
	"auth_type" text DEFAULT 'none' NOT NULL,
	"auth_config" jsonb,
	"trusted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "mcp_servers_org_name_unique" UNIQUE("org_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_mcp_servers" (
	"agent_id" uuid NOT NULL,
	"mcp_server_id" uuid NOT NULL,
	CONSTRAINT "agent_mcp_servers_agent_id_mcp_server_id_pk" PRIMARY KEY("agent_id","mcp_server_id")
);
--> statement-breakpoint
-- Add columns if they don't exist (for installs stuck on 0003 schema)
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "icon_url" text;
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "auth_type" text DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "auth_config" jsonb;
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "trusted" boolean DEFAULT false;
--> statement-breakpoint
-- Backfill defaults for any rows that existed before auth columns were added
UPDATE "mcp_servers" SET "auth_type" = 'none' WHERE "auth_type" IS NULL;
UPDATE "mcp_servers" SET "trusted" = false WHERE "trusted" IS NULL;
--> statement-breakpoint
-- FKs (idempotent via IF NOT EXISTS)
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT IF NOT EXISTS "agent_mcp_servers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT IF NOT EXISTS "agent_mcp_servers_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_org_id_idx" ON "mcp_servers" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_mcp_servers_agent_id_idx" ON "agent_mcp_servers" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_mcp_servers_mcp_server_id_idx" ON "agent_mcp_servers" USING btree ("mcp_server_id");
