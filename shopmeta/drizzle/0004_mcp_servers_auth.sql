-- Migration 0004: Add auth + icon fields to mcp_servers, and create the base tables if not exist.
-- This migration handles two cases:
--   1. Fresh installs (0003 never ran): creates mcp_servers + agent_mcp_servers from scratch
--   2. Existing installs that ran 0003: adds the new auth/icon columns

-- Create tables if they don't already exist (idempotent)
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
-- Add new columns to mcp_servers if they don't already exist (for installs that ran 0003)
DO $$ BEGIN
  ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "icon_url" text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "auth_type" text DEFAULT 'none' NOT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "auth_config" jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "trusted" boolean DEFAULT false NOT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
--> statement-breakpoint
-- Add FKs if not already present
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT IF NOT EXISTS "agent_mcp_servers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT IF NOT EXISTS "agent_mcp_servers_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_org_id_idx" ON "mcp_servers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_mcp_servers_agent_id_idx" ON "agent_mcp_servers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_mcp_servers_mcp_server_id_idx" ON "agent_mcp_servers" USING btree ("mcp_server_id");
