import { getDb, databaseFailure } from "@/db";
import { CUSTOM_PRODUCT_START, ensureProductTable, nameKey, normalizeName, originalNameKeys } from "@/db/catalogue";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403, headers });
  let body: { name?: unknown; creationId?: unknown };
  try {
    const text = await request.text();
    if (text.length > 4000) throw new Error();
    body = JSON.parse(text);
  } catch { return Response.json({ error: "Invalid product request." }, { status: 400, headers }); }
  if (typeof body?.name !== "string" || typeof body?.creationId !== "string" || !/^[\w-]{16,80}$/.test(body.creationId)) return Response.json({ error: "Enter a product name." }, { status: 400, headers });
  const name = normalizeName(body.name), key = nameKey(name);
  if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/u.test(name)) return Response.json({ error: "Use a product name between 1 and 160 characters." }, { status: 400, headers });
  if (originalNameKeys.has(key)) return Response.json({ error: "A product with this name already exists. Search for it in the list." }, { status: 409, headers });
  try {
    const db = getDb();
    await ensureProductTable(db);
    // Atomic ID allocation plus unique constraints make concurrent submits and
    // same-request retries safe, including a retry after a lost HTTP response.
    const created = await db.prepare(`INSERT INTO custom_products (id, name, name_key, creation_id)
      SELECT COALESCE(MAX(id) + 1, ?), ?, ?, ? FROM custom_products
      WHERE true ON CONFLICT DO NOTHING RETURNING id, name, name_key`)
      .bind(CUSTOM_PRODUCT_START, name, key, body.creationId).first<{ id: number; name: string; name_key: string }>();
    const product = created ?? await db.prepare("SELECT id, name, name_key FROM custom_products WHERE creation_id = ?").bind(body.creationId).first<{ id: number; name: string; name_key: string }>();
    if (!product || product.name_key !== key) return Response.json({ error: "A product with this name already exists, or this submission was already used. Refresh the list before trying again." }, { status: 409, headers });
    return Response.json({ id: product.id, name: product.name }, { status: created ? 201 : 200, headers });
  } catch (error) { return Response.json({ ...databaseFailure(error), error: "Product creation could not be confirmed. Retry with the same name; it will not create a duplicate." }, { status: 503, headers }); }
}
