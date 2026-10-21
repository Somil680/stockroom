import { getDb } from "@/db";
import products from "@/data/products.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const ids = new Set(products.map(p => p.id));
const headers = { "Cache-Control": "no-store" };
type Row = { product_id: number; quantity: number; version: number; mutation_id: string };
const db = getDb;

export async function GET() {
  try {
    const { results } = await db().prepare("SELECT product_id, quantity, version FROM stock").all<Row>();
    const rows = new Map(results.map(r => [r.product_id, r]));
    return Response.json(products.map(p => ({ ...p, quantity: rows.get(p.id)?.quantity ?? 0, version: rows.get(p.id)?.version ?? 0 })), { headers });
  } catch { return Response.json({ error: "Unable to load stock. Please retry." }, { status: 503, headers }); }
}

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  let body: { id?: number; quantity?: number; version?: number; mutationId?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const { id, quantity, version, mutationId } = body ?? {};
  if (typeof id !== "number" || !ids.has(id) || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 999999 || typeof version !== "number" || !Number.isSafeInteger(version) || version < 0 || typeof mutationId !== "string" || !/^[\w-]{16,80}$/.test(mutationId)) {
    return Response.json({ error: "Enter a whole number from 0 to 999999." }, { status: 400, headers });
  }
  try {
    const row = await db().prepare(`INSERT INTO stock (product_id, quantity, version, mutation_id)
      SELECT ?, ?, 1, ? WHERE ? = 0
      ON CONFLICT(product_id) DO UPDATE SET quantity = excluded.quantity, version = stock.version + 1, mutation_id = excluded.mutation_id WHERE stock.version = ?
      RETURNING product_id, quantity, version, mutation_id`).bind(id, quantity, mutationId, version, version).first<Row>();
    // Existing rows need an UPDATE when their version is greater than zero.
    const updated = row ?? (version > 0 ? await db().prepare("UPDATE stock SET quantity = ?, version = version + 1, mutation_id = ? WHERE product_id = ? AND version = ? RETURNING product_id, quantity, version, mutation_id").bind(quantity, mutationId, id, version).first<Row>() : null);
    if (updated) return Response.json({ quantity: updated.quantity, version: updated.version }, { headers });
    const current = await db().prepare("SELECT product_id, quantity, version, mutation_id FROM stock WHERE product_id = ?").bind(id).first<Row>();
    if (current?.mutation_id === mutationId) return Response.json({ quantity: current.quantity, version: current.version }, { headers });
    return Response.json({ error: "Stock changed on another device.", current: { quantity: current?.quantity ?? 0, version: current?.version ?? 0 } }, { status: 409, headers });
  } catch { return Response.json({ error: "Not saved. Check your connection and retry." }, { status: 503, headers }); }
}
