CREATE TABLE "sap_entity_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_set" text NOT NULL,
	"enabled_ops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"label_field" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sap_entity_configs" ADD CONSTRAINT "sap_entity_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sap_entity_configs_tenant_set_idx" ON "sap_entity_configs" USING btree ("tenant_id","entity_set");