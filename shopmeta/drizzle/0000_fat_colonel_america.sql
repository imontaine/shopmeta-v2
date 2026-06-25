CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"system_instructions" text,
	"mcp_servers" jsonb,
	"temperature" integer,
	"max_tokens" integer,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 8443,
	"database" text NOT NULL,
	"username" text NOT NULL,
	"encrypted_password" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"agent_id" uuid,
	"title" text DEFAULT 'New Chat',
	"model" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"layout" jsonb,
	"is_default" boolean DEFAULT false,
	"shared_with" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"parent_id" uuid,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"tool_calls" jsonb,
	"metrics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"conversation_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"sql" text NOT NULL,
	"chart_config" jsonb,
	"refresh_interval" integer,
	"connection_id" uuid,
	"cached_data" jsonb,
	"last_refreshed" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_org_id_idx" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agents_is_default_idx" ON "agents" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "connections_org_id_idx" ON "connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "connections_is_default_idx" ON "connections" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_org_id_idx" ON "conversations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conversations_created_at_idx" ON "conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dashboards_org_id_idx" ON "dashboards" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dashboards_created_by_idx" ON "dashboards" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "dashboards_is_default_idx" ON "dashboards" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_records_user_id_idx" ON "usage_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_records_org_id_idx" ON "usage_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "usage_records_model_idx" ON "usage_records" USING btree ("model");--> statement-breakpoint
CREATE INDEX "usage_records_created_at_idx" ON "usage_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "widgets_dashboard_id_idx" ON "widgets" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "widgets_connection_id_idx" ON "widgets" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "widgets_type_idx" ON "widgets" USING btree ("type");