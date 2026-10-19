CREATE TABLE `stock` (
	`product_id` integer PRIMARY KEY NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`mutation_id` text DEFAULT '' NOT NULL
);
