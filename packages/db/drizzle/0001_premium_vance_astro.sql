CREATE TYPE "public"."mapping_status" AS ENUM('pending', 'committed', 'failed');--> statement-breakpoint
CREATE TABLE "mapping_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"config_id" uuid,
	"sap_object_type" text NOT NULL,
	"sap_doc_entry" integer,
	"sap_doc_num" integer,
	"status" "mapping_status" DEFAULT 'pending' NOT NULL,
	"request_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mapping_log" ADD CONSTRAINT "mapping_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_log" ADD CONSTRAINT "mapping_log_config_id_configurations_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_log_tenant_idem_idx" ON "mapping_log" USING btree ("tenant_id","idempotency_key");