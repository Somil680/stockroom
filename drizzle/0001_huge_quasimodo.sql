CREATE TABLE IF NOT EXISTS `custom_products` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`creation_id` text NOT NULL,
	CONSTRAINT "custom_product_id_range" CHECK("custom_products"."id" >= 1000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `custom_products_name_key_unique` ON `custom_products` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `custom_products_creation_id_unique` ON `custom_products` (`creation_id`);
