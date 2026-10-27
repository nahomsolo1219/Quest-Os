CREATE TABLE "tour_progress" (
	"user_id" uuid NOT NULL,
	"tour_id" text NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_progress_user_id_tour_id_pk" PRIMARY KEY("user_id","tour_id"),
	CONSTRAINT "tour_progress_status_chk" CHECK ("tour_progress"."status" in ('started', 'completed', 'skipped')),
	CONSTRAINT "tour_progress_step_chk" CHECK ("tour_progress"."step" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tour_progress" ADD CONSTRAINT "tour_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;