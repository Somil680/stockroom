import { env } from "cloudflare:workers";
import { MAX_BACKUP_BYTES, validateBackup, validateProducts } from "@/lib/backup";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  let backup, expected, mutationId;
  try {
    const text = await request.text();
    if (text.length > MAX_BACKUP_BYTES * 2) throw new Error("Restore request is too large.");
    const body = JSON.parse(text);
    backup = validateBackup(body?.backup);
    expected = validateProducts(body?.expected);
    mutationId = body?.mutationId;
    if (typeof mutationId !== "string" || !/^[\w-]{16,80}$/.test(mutationId)) throw new Error("Invalid restore request ID.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid backup" }, { status: 400, headers }); }
  if (!env.DB) return Response.json({ error: "Database unavailable. Nothing was restored." }, { status: 503, headers });
  const versions = new Map(expected.map(p => [p.id, p.version]));
  const rows = backup.products.map(p => ({ id: p.id, quantity: p.quantity, version: versions.get(p.id) }));
  try {
    // One SQL statement checks every previewed version and applies the whole restore.
    // Any stale row blocks ALL writes. No partial restore and no schema changes.
    const { results } = await env.DB.prepare(`WITH incoming AS (
      SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.quantity') AS quantity,
             json_extract(value, '$.version') AS version FROM json_each(?)
    )
    INSERT INTO stock (product_id, quantity, version, mutation_id)
    SELECT i.id, i.quantity, 1, ? FROM incoming i
    LEFT JOIN stock s ON s.product_id = i.id
    WHERE COALESCE(s.quantity, 0) != i.quantity
      AND NOT EXISTS (SELECT 1 FROM incoming c LEFT JOIN stock t ON t.product_id = c.id WHERE COALESCE(t.version, 0) != c.version)
    ON CONFLICT(product_id) DO UPDATE SET quantity = excluded.quantity, version = stock.version + 1, mutation_id = excluded.mutation_id
    RETURNING product_id, quantity, version`).bind(JSON.stringify(rows), mutationId).all();
    if (results.length) return Response.json({ restored: results.length }, { headers });
    const { results: saved } = await env.DB.prepare("SELECT product_id, quantity FROM stock").all<{ product_id: number; quantity: number }>();
    const quantities = new Map(saved.map(p => [p.product_id, p.quantity]));
    // A retry after a lost response is successful if the requested data is already present.
    if (backup.products.every(p => p.quantity === (quantities.get(p.id) ?? 0))) return Response.json({ restored: 0, alreadyApplied: true }, { headers });
    return Response.json({ error: "Stock changed since this preview. No changes were restored. Refresh and review again." }, { status: 409, headers });
  } catch { return Response.json({ error: "Restore could not be confirmed. Refresh stock before retrying; keep your backup file." }, { status: 503, headers }); }
}
