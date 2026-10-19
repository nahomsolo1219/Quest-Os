CREATE TYPE "public"."activity" AS ENUM('sedentary', 'light', 'moderate', 'very_active', 'athlete');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('lead', 'active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."contribution_type" AS ENUM('cash', 'time', 'equipment', 'other');--> statement-breakpoint
CREATE TYPE "public"."delivery_option" AS ENUM('daily', 'three_drops', 'every_3_days', 'weekly', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."drop_status" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."food_group" AS ENUM('chicken', 'beef', 'fish', 'eggs', 'dairy', 'vegetables', 'fruit', 'grains', 'legumes', 'oil', 'other');--> statement-breakpoint
CREATE TYPE "public"."goal" AS ENUM('lean', 'build');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('weekly', 'monthly', 'quick_start', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('instagram', 'referral', 'walk_in', 'other');--> statement-breakpoint
CREATE TYPE "public"."menu_code" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('locked', 'skipped_unpaid', 'paused');--> statement-breakpoint
CREATE TYPE "public"."package_code" AS ENUM('essential', 'performance', 'premium');--> statement-breakpoint
CREATE TYPE "public"."part_category" AS ENUM('protein', 'carb', 'fat', 'veg', 'dairy', 'fruit', 'sauce', 'seasoning');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('telebirr', 'cbe', 'cash');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('submitted', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('post', 'progress', 'question', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."profile" AS ENUM('S_LEAN', 'S_BUILD', 'M_LEAN', 'M_BUILD', 'L_LEAN', 'L_BUILD');--> statement-breakpoint
CREATE TYPE "public"."purchase_unit" AS ENUM('kg', 'litre', 'piece');--> statement-breakpoint
CREATE TYPE "public"."reaction" AS ENUM('like', 'fire', 'strong');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'operations', 'nutritionist', 'kitchen', 'delivery', 'coach', 'client');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."size" AS ENUM('S', 'M', 'L');--> statement-breakpoint
CREATE TYPE "public"."slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending_payment', 'active', 'paused', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."swap_status" AS ENUM('requested', 'approved', 'rejected', 'ended');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false NOT NULL,
	"roles" "role"[] DEFAULT '{}'::role[] NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"status" "client_status" DEFAULT 'lead' NOT NULL,
	"lead_source" "lead_source",
	"lead_notes" text,
	"sex" "sex",
	"age" integer,
	"weight_g" integer,
	"height_cm" integer,
	"activity" "activity",
	"goal" "goal",
	"allergies" text[] DEFAULT '{}'::text[] NOT NULL,
	"dislikes" text[] DEFAULT '{}'::text[] NOT NULL,
	"address" text,
	"area_id" uuid,
	"landmark" text,
	"check_in_weekday" integer,
	"telegram_opt_in" boolean DEFAULT false NOT NULL,
	"community_muted_until" timestamp with time zone,
	"ended_at" date,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "clients_phone_unique" UNIQUE("phone"),
	CONSTRAINT "clients_check_in_weekday_chk" CHECK ("clients"."check_in_weekday" is null or "clients"."check_in_weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"held_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"notes" text,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultations_mode_chk" CHECK ("consultations"."mode" in ('in_person', 'phone'))
);
--> statement-breakpoint
CREATE TABLE "nutrition_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"bmr" integer NOT NULL,
	"tdee" integer NOT NULL,
	"suggested_kcal" integer NOT NULL,
	"suggested_size" "size" NOT NULL,
	"suggested_protein_g" integer NOT NULL,
	"suggested_carb_g" integer NOT NULL,
	"suggested_fat_g" integer NOT NULL,
	"kcal_target" integer NOT NULL,
	"size" "size" NOT NULL,
	"goal" "goal" NOT NULL,
	"protein_g" integer NOT NULL,
	"carb_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"provisional" boolean DEFAULT false NOT NULL,
	"set_by_user_id" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text DEFAULT 'extra_protein' NOT NULL,
	"slot" "slot" NOT NULL,
	"effective_week_start" date NOT NULL,
	"ended_week_start" date,
	"price_birr_per_portion" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_addons_kind_chk" CHECK ("client_addons"."kind" in ('extra_protein'))
);
--> statement-breakpoint
CREATE TABLE "client_swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"swap_rule_id" uuid,
	"custom_request" text,
	"status" "swap_status" DEFAULT 'requested' NOT NULL,
	"effective_week_start" date NOT NULL,
	"ended_week_start" date,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"cost_per_unit_birr" integer NOT NULL,
	"source" text NOT NULL,
	"purchase_id" uuid,
	"set_by_user_id" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_prices_source_chk" CHECK ("ingredient_prices"."source" in ('purchase', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"food_group" "food_group" NOT NULL,
	"purchase_unit" "purchase_unit" NOT NULL,
	"grams_per_unit" integer NOT NULL,
	"nutrition_basis" text NOT NULL,
	"kcal" numeric(7, 2) NOT NULL,
	"protein_g" numeric(7, 2) NOT NULL,
	"carb_g" numeric(7, 2) NOT NULL,
	"fat_g" numeric(7, 2) NOT NULL,
	"cost_per_unit_birr" integer,
	"supplier" text,
	"stock_ingredient_id" uuid,
	"tracked_in_stock" boolean DEFAULT true NOT NULL,
	"short_shelf_life" boolean DEFAULT false NOT NULL,
	"is_seasoning" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ingredients_name_unique" UNIQUE("name"),
	CONSTRAINT "ingredients_nutrition_basis_chk" CHECK ("ingredients"."nutrition_basis" in ('per_100g', 'per_piece'))
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"menu" "menu_code",
	"slot" "slot" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"keeps_days" integer NOT NULL,
	"pantry" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meals_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "part_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty" numeric(8, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_ingredients_part_ingredient_uq" UNIQUE("part_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "part_category" NOT NULL,
	"unit" text NOT NULL,
	"base_qty" numeric(8, 1) NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parts_meal_name_uq" UNIQUE("meal_id","name"),
	CONSTRAINT "parts_unit_chk" CHECK ("parts"."unit" in ('g', 'piece'))
);
--> statement-breakpoint
CREATE TABLE "profile_day_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu" "menu_code" NOT NULL,
	"profile" "profile" NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"carb_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"factors" jsonb NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_day_results_menu_profile_uq" UNIQUE("menu","profile")
);
--> statement-breakpoint
CREATE TABLE "profile_portions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"profile" "profile" NOT NULL,
	"qty" integer NOT NULL,
	"computed_qty" integer NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_portions_part_profile_uq" UNIQUE("part_id","profile")
);
--> statement-breakpoint
CREATE TABLE "swap_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"from_kind" text NOT NULL,
	"from_ingredient_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"from_meal_codes" text[],
	"from_slot" "slot",
	"to_ingredient_id" uuid,
	"to_ingredient_split" jsonb,
	"to_meal_id" uuid,
	"qty_mode" text NOT NULL,
	"qty_value" numeric(8, 1),
	"cost_mode" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swap_rules_code_unique" UNIQUE("code"),
	CONSTRAINT "swap_rules_from_kind_chk" CHECK ("swap_rules"."from_kind" in ('ingredient', 'slot')),
	CONSTRAINT "swap_rules_qty_mode_chk" CHECK ("swap_rules"."qty_mode" in ('same', 'fixed', 'multiply', 'add')),
	CONSTRAINT "swap_rules_cost_mode_chk" CHECK ("swap_rules"."cost_mode" in ('zero', 'price_difference'))
);
--> statement-breakpoint
CREATE TABLE "account_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_birr" integer NOT NULL,
	"reason" text NOT NULL,
	"applied_invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"service_days" integer NOT NULL,
	"amount_birr" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"credit_applied_birr" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_subscription_kind_period_uq" UNIQUE("subscription_id","kind","period_start")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "package_code" NOT NULL,
	"name" text NOT NULL,
	"swap_limit" integer NOT NULL,
	"checkin_interval_days" integer NOT NULL,
	"coaching" text DEFAULT '' NOT NULL,
	"delivery_options" "delivery_option"[] NOT NULL,
	"service_fee_month_birr" integer DEFAULT 0 NOT NULL,
	"priority_slot" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"start_week" date NOT NULL,
	"weeks" integer NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pauses_weeks_chk" CHECK ("pauses"."weeks" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_birr" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"receipt_key" text,
	"status" "payment_status" DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"rejection_reason" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"goal" "goal" NOT NULL,
	"delivery_option" "delivery_option" NOT NULL,
	"billing_period" "billing_period" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"term_months" integer DEFAULT 1 NOT NULL,
	"price_day_birr" integer NOT NULL,
	"price_month_birr" integer NOT NULL,
	"plan_price_birr" integer NOT NULL,
	"price_breakdown" jsonb,
	"price_locked_until" date NOT NULL,
	"discount_month_birr" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"discount_by_user_id" uuid,
	"status" "subscription_status" DEFAULT 'pending_payment' NOT NULL,
	"is_quick_start" boolean DEFAULT false NOT NULL,
	"quick_start_period_end" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_term_chk" CHECK ("subscriptions"."term_months" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "order_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_order_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"cook_date" date NOT NULL,
	"drop_date" date NOT NULL,
	"menu" "menu_code" NOT NULL,
	"is_quick_start" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_days_client_service_date_uq" UNIQUE("client_id","service_date")
);
--> statement-breakpoint
CREATE TABLE "order_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_day_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"slot" "slot" NOT NULL,
	"profile" "profile" NOT NULL,
	"items" jsonb NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"carb_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"conflicts" text[] DEFAULT '{}'::text[] NOT NULL,
	"cook_date" date NOT NULL,
	"eat_by" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_meals_day_slot_uq" UNIQUE("order_day_id","slot")
);
--> statement-breakpoint
CREATE TABLE "weekly_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"profile" "profile" NOT NULL,
	"status" "order_status" NOT NULL,
	"is_quick_start" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_option" "delivery_option" NOT NULL,
	"skip_reason" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_orders_client_week_uq" UNIQUE("client_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"total_price_birr" integer NOT NULL,
	"supplier" text,
	"purchased_on" date NOT NULL,
	"by_user_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"count_date" date NOT NULL,
	"qty" integer NOT NULL,
	"by_user_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_ingredient_date_uq" UNIQUE("ingredient_id","count_date")
);
--> statement-breakpoint
CREATE TABLE "waste_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"reason" text,
	"logged_on" date NOT NULL,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_date" date NOT NULL,
	"client_id" uuid NOT NULL,
	"slot" text,
	"kind" text NOT NULL,
	"area_id" uuid,
	"address_snapshot" text,
	"phone_snapshot" text,
	"rider_user_id" uuid,
	"route_position" integer DEFAULT 0 NOT NULL,
	"status" "drop_status" DEFAULT 'pending' NOT NULL,
	"failed_reason" text,
	"delivered_at" timestamp with time zone,
	"service_dates" date[] DEFAULT '{}'::date[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_drops_kind_chk" CHECK ("delivery_drops"."kind" in ('delivery', 'pickup')),
	CONSTRAINT "delivery_drops_slot_chk" CHECK ("delivery_drops"."slot" is null or "delivery_drops"."slot" in ('breakfast', 'lunch', 'dinner_snack'))
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"checkin_date" date NOT NULL,
	"weight_g" integer,
	"adherence_pct" integer,
	"notes" text,
	"by_user_id" uuid,
	"source" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_source_chk" CHECK ("checkins"."source" in ('client', 'nutritionist')),
	CONSTRAINT "checkins_adherence_chk" CHECK ("checkins"."adherence_pct" is null or "checkins"."adherence_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"run_key" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_runs_job_run_key_uq" UNIQUE("job","run_key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"telegram_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "notifications_telegram_status_chk" CHECK ("notifications"."telegram_status" in ('none', 'pending', 'sent', 'failed', 'digest'))
);
--> statement-breakpoint
CREATE TABLE "partner_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_user_id" uuid NOT NULL,
	"contributed_on" date NOT NULL,
	"type" "contribution_type" NOT NULL,
	"amount_birr" integer,
	"hours" numeric(6, 1),
	"note" text,
	"created_by" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" text,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_links_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"checkin_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_checkins_uq" UNIQUE("challenge_id","user_id","checkin_date")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_dates_chk" CHECK ("challenges"."ends_on" >= "challenges"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "community_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_comments_body_len_chk" CHECK (char_length("community_comments"."body") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "community_mutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"reason" text,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"type" "post_type" DEFAULT 'post' NOT NULL,
	"body" text NOT NULL,
	"photo_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"progress" jsonb,
	"pinned" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid,
	"hidden_reason" text,
	"answer_comment_id" uuid,
	"challenge_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_posts_body_len_chk" CHECK (char_length("community_posts"."body") <= 2000),
	CONSTRAINT "community_posts_photos_chk" CHECK (coalesce(array_length("community_posts"."photo_keys", 1), 0) <= 4)
);
--> statement-breakpoint
CREATE TABLE "community_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "reaction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reactions_post_user_uq" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reports_target_type_chk" CHECK ("community_reports"."target_type" in ('post', 'comment'))
);
--> statement-breakpoint
CREATE TABLE "meal_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_ratings_client_meal_date_uq" UNIQUE("client_id","meal_id","service_date"),
	CONSTRAINT "meal_ratings_rating_chk" CHECK ("meal_ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_profiles" ADD CONSTRAINT "nutrition_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_profiles" ADD CONSTRAINT "nutrition_profiles_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_addons" ADD CONSTRAINT "client_addons_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_addons" ADD CONSTRAINT "client_addons_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_swaps" ADD CONSTRAINT "client_swaps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_swaps" ADD CONSTRAINT "client_swaps_swap_rule_id_swap_rules_id_fk" FOREIGN KEY ("swap_rule_id") REFERENCES "public"."swap_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_swaps" ADD CONSTRAINT "client_swaps_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_swaps" ADD CONSTRAINT "client_swaps_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_stock_ingredient_id_ingredients_id_fk" FOREIGN KEY ("stock_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_ingredients" ADD CONSTRAINT "part_ingredients_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_ingredients" ADD CONSTRAINT "part_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_portions" ADD CONSTRAINT "profile_portions_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_portions" ADD CONSTRAINT "profile_portions_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_rules" ADD CONSTRAINT "swap_rules_to_ingredient_id_ingredients_id_fk" FOREIGN KEY ("to_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_rules" ADD CONSTRAINT "swap_rules_to_meal_id_meals_id_fk" FOREIGN KEY ("to_meal_id") REFERENCES "public"."meals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_applied_invoice_id_invoices_id_fk" FOREIGN KEY ("applied_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauses" ADD CONSTRAINT "pauses_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauses" ADD CONSTRAINT "pauses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauses" ADD CONSTRAINT "pauses_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_by_user_id_user_id_fk" FOREIGN KEY ("discount_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_days" ADD CONSTRAINT "order_days_weekly_order_id_weekly_orders_id_fk" FOREIGN KEY ("weekly_order_id") REFERENCES "public"."weekly_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_days" ADD CONSTRAINT "order_days_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_meals" ADD CONSTRAINT "order_meals_order_day_id_order_days_id_fk" FOREIGN KEY ("order_day_id") REFERENCES "public"."order_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_meals" ADD CONSTRAINT "order_meals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_meals" ADD CONSTRAINT "order_meals_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_orders" ADD CONSTRAINT "weekly_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_orders" ADD CONSTRAINT "weekly_orders_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_drops" ADD CONSTRAINT "delivery_drops_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_drops" ADD CONSTRAINT "delivery_drops_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_drops" ADD CONSTRAINT "delivery_drops_rider_user_id_user_id_fk" FOREIGN KEY ("rider_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contributions" ADD CONSTRAINT "partner_contributions_partner_user_id_user_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contributions" ADD CONSTRAINT "partner_contributions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_checkins" ADD CONSTRAINT "challenge_checkins_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_checkins" ADD CONSTRAINT "challenge_checkins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_hidden_by_user_id_user_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_mutes" ADD CONSTRAINT "community_mutes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_mutes" ADD CONSTRAINT "community_mutes_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_hidden_by_user_id_user_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_ratings" ADD CONSTRAINT "meal_ratings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_ratings" ADD CONSTRAINT "meal_ratings_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_area_id_idx" ON "clients" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "consultations_client_id_idx" ON "consultations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "nutrition_profiles_client_id_idx" ON "nutrition_profiles" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_profiles_one_current_uq" ON "nutrition_profiles" USING btree ("client_id") WHERE "nutrition_profiles"."is_current";--> statement-breakpoint
CREATE INDEX "client_addons_client_idx" ON "client_addons" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_swaps_client_idx" ON "client_swaps" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "ingredient_prices_ingredient_idx" ON "ingredient_prices" USING btree ("ingredient_id","set_at");--> statement-breakpoint
CREATE INDEX "part_ingredients_ingredient_idx" ON "part_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "parts_meal_id_idx" ON "parts" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "account_credits_client_idx" ON "account_credits" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id","period_start");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pauses_client_idx" ON "pauses" USING btree ("client_id","start_week");--> statement-breakpoint
CREATE INDEX "pauses_subscription_idx" ON "pauses" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_client_idx" ON "payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_client_idx" ON "subscriptions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_days_cook_date_idx" ON "order_days" USING btree ("cook_date");--> statement-breakpoint
CREATE INDEX "order_days_drop_date_idx" ON "order_days" USING btree ("drop_date");--> statement-breakpoint
CREATE INDEX "order_days_weekly_order_idx" ON "order_days" USING btree ("weekly_order_id");--> statement-breakpoint
CREATE INDEX "order_meals_cook_date_idx" ON "order_meals" USING btree ("cook_date");--> statement-breakpoint
CREATE INDEX "order_meals_client_idx" ON "order_meals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "weekly_orders_week_idx" ON "weekly_orders" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "purchases_ingredient_date_idx" ON "purchases" USING btree ("ingredient_id","purchased_on");--> statement-breakpoint
CREATE INDEX "purchases_date_idx" ON "purchases" USING btree ("purchased_on");--> statement-breakpoint
CREATE INDEX "waste_log_ingredient_date_idx" ON "waste_log" USING btree ("ingredient_id","logged_on");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_drops_client_date_slot_uq" ON "delivery_drops" USING btree ("client_id","drop_date",coalesce("slot", 'all'));--> statement-breakpoint
CREATE INDEX "delivery_drops_date_idx" ON "delivery_drops" USING btree ("drop_date","route_position");--> statement-breakpoint
CREATE INDEX "delivery_drops_rider_idx" ON "delivery_drops" USING btree ("rider_user_id","drop_date");--> statement-breakpoint
CREATE INDEX "checkins_client_date_idx" ON "checkins" USING btree ("client_id","checkin_date");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_contributions_partner_idx" ON "partner_contributions" USING btree ("partner_user_id","contributed_on");--> statement-breakpoint
CREATE INDEX "community_comments_post_idx" ON "community_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "community_mutes_user_idx" ON "community_mutes" USING btree ("user_id","until");--> statement-breakpoint
CREATE INDEX "community_posts_feed_idx" ON "community_posts" USING btree ("pinned","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_author_idx" ON "community_posts" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "community_reports_status_idx" ON "community_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "meal_ratings_meal_date_idx" ON "meal_ratings" USING btree ("meal_id","service_date");