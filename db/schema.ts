import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
export const stock = sqliteTable("stock", {
  productId: integer("product_id").primaryKey(),
  quantity: integer("quantity").notNull().default(0),
  version: integer("version").notNull().default(0),
  mutationId: text("mutation_id").notNull().default(""),
});
