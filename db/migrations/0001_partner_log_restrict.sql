ALTER TABLE "partner_contributions" DROP CONSTRAINT "partner_contributions_partner_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "partner_contributions" ADD CONSTRAINT "partner_contributions_partner_user_id_user_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;