CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`shift_id` text,
	`reference` text NOT NULL,
	`merchant_name` text NOT NULL,
	`merchant_address` text,
	`dropoff_address` text,
	`customer_label` text,
	`pickup_at` text NOT NULL,
	`dropoff_at` text,
	`base_pay_cents` integer DEFAULT 0 NOT NULL,
	`tip_cents` integer DEFAULT 0 NOT NULL,
	`bonus_cents` integer DEFAULT 0 NOT NULL,
	`distance_miles` integer,
	`provider_distance_miles` integer,
	`duration_minutes` integer,
	`items_count` integer,
	`status` text DEFAULT 'completed' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_driver_reference_idx` ON `deliveries` (`driver_id`,`reference`);--> statement-breakpoint
CREATE INDEX `deliveries_driver_created_idx` ON `deliveries` (`driver_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `deliveries_shift_idx` ON `deliveries` (`shift_id`);--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`color_key` text DEFAULT 'brand' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drivers_email_idx` ON `drivers` (`email`);--> statement-breakpoint
CREATE INDEX `drivers_household_idx` ON `drivers` (`household_id`);--> statement-breakpoint
CREATE TABLE `expense_shares` (
	`expense_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`share_cents` integer NOT NULL,
	PRIMARY KEY(`expense_id`, `driver_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`shift_id` text,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`vendor` text,
	`note` text,
	`odometer_miles` integer,
	`is_business_mile` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expenses_driver_occurred_idx` ON `expenses` (`driver_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `expenses_shift_idx` ON `expenses` (`shift_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `households_invite_code_idx` ON `households` (`invite_code`);--> statement-breakpoint
CREATE TABLE `insight_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`generated_at` text NOT NULL,
	`engine` text NOT NULL,
	`model` text,
	`payload` text NOT NULL,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `insight_driver_idx` ON `insight_reports` (`driver_id`,`generated_at`);--> statement-breakpoint
CREATE TABLE `odometer_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`vehicle_id` text,
	`shift_id` text,
	`odometer_miles` integer NOT NULL,
	`recorded_at` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `odometer_driver_recorded_idx` ON `odometer_readings` (`driver_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `provider_health` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_key` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`checked_at` text NOT NULL,
	`latency_ms` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_health_key_idx` ON `provider_health` (`provider_key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_driver_idx` ON `sessions` (`driver_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`vehicle_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`start_odometer_miles` integer,
	`end_odometer_miles` integer,
	`personal_miles` integer DEFAULT 0 NOT NULL,
	`idle_minutes` integer DEFAULT 0 NOT NULL,
	`base_location` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shifts_driver_started_idx` ON `shifts` (`driver_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `shifts_status_idx` ON `shifts` (`status`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`driver_id` text,
	`label` text NOT NULL,
	`make_model` text,
	`model_year` integer,
	`odometer_miles` integer DEFAULT 0 NOT NULL,
	`purchase_price_cents` integer,
	`current_value_cents` integer,
	`mpg` integer,
	`fuel_price_cents_per_gallon` integer,
	`insurance_cents_per_month` integer,
	`registration_cents_per_year` integer,
	`recurring_service_cents_per_year` integer,
	`maintenance_cents_per_year` integer,
	`maintenance_milli_per_mile` integer DEFAULT 0 NOT NULL,
	`depreciation_milli_per_mile` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `vehicles_household_idx` ON `vehicles` (`household_id`);