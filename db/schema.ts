import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, check } from "drizzle-orm/sqlite-core";
export const stock = sqliteTable("stock", {
  productId: integer("product_id").primaryKey(),
  quantity: integer("quantity").notNull().default(0),
  version: integer("version").notNull().default(0),
  mutationId: text("mutation_id").notNull().default(""),
});

export const customProducts = sqliteTable("custom_products", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  creationId: text("creation_id").notNull().unique(),
}, table => [check("custom_product_id_range", sql`${table.id} >= 1000000`)]);
