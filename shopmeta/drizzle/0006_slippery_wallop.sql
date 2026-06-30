CREATE TABLE "agent_mcp_servers" (
	"agent_id" uuid NOT NULL,
	"mcp_server_id" uuid NOT NULL,
	CONSTRAINT "agent_mcp_servers_agent_id_mcp_server_id_pk" PRIMARY KEY("agent_id","mcp_server_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
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
	"oauth_client_info" jsonb,
	"oauth_state" jsonb,
	"trusted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "mcp_servers_org_name_unique" UNIQUE("org_id","name")
);
--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_mcp_servers_agent_id_idx" ON "agent_mcp_servers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_servers_mcp_server_id_idx" ON "agent_mcp_servers" USING btree ("mcp_server_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_org_id_idx" ON "mcp_servers" USING btree ("org_id");