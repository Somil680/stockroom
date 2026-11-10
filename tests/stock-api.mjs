import { testClient, catalogueURL, databaseFailure, D1Error } from "./d1-test-client.mjs";
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const database = new DatabaseSync(':memory:');
database.exec(readFileSync('drizzle/0000_red_northstar.sql', 'utf8'));
globalThis.__stockTestEnv = { DB: testClient(database), databaseFailure };
const source = readFileSync('app/api/stock/route.ts', 'utf8').replace('import { getDb, databaseFailure } from "@/db";', 'const getDb = () => globalThis.__stockTestEnv.DB; const databaseFailure = globalThis.__stockTestEnv.databaseFailure;').replace('"@/db/catalogue"', JSON.stringify(catalogueURL));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { GET, PATCH } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const send = (body, origin = 'https://shop.test') => PATCH(new Request('https://shop.test/api/stock', { method: 'PATCH', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) }));
const initial = await (await GET()).json();
assert.equal(initial.length, 731); assert.ok(initial.every(p => p.quantity === 0)); assert.equal(new Set(initial.map(p => p.name)).size, 731);
let version = 0;
for (const [i, quantity] of [1, 2, 1, 123, 0].entries()) {
  const body = { id: 1, quantity, version, mutationId: `mutation-test-${i}-00000` };
  const response = await send(body); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.quantity, quantity); assert.equal(result.version, version + 1);
  const retry = await send(body); assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), result);
  version = result.version;
}
const conflict = await send({ id: 1, quantity: 999, version: 0, mutationId: 'conflict-mutation-00000' }); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).current.quantity, 0);
for (const quantity of [-1, 0.5, 1000000, '3', null]) assert.equal((await send({ id: 2, quantity, version: 0, mutationId: 'bad-quantity-00000000' })).status, 400);
assert.equal((await send({ id: 9999, quantity: 1, version: 0, mutationId: 'invalid-id-0000000000' })).status, 400);
assert.equal((await send({ id: 2, quantity: 1, version: 0, mutationId: 'cross-origin-00000000' }, 'https://other.test')).status, 403);
const acrossDevice = await (await GET()).json(); assert.equal(acrossDevice[0].version, version); assert.ok(acrossDevice.every(p => p.quantity === 0));
const productSource = readFileSync('app/api/products/route.ts', 'utf8')
  .replace('import { getDb, databaseFailure } from "@/db";', 'const getDb = () => globalThis.__stockTestEnv.DB; const databaseFailure = globalThis.__stockTestEnv.databaseFailure;')
  .replace('"@/db/catalogue"', JSON.stringify(catalogueURL));
const productJS = ts.transpileModule(productSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { POST: add } = await import('data:text/javascript;base64,' + Buffer.from(productJS).toString('base64'));
const create = (name, creationId = 'new-product-test-00000', origin = 'https://shop.test') => add(new Request('https://shop.test/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify({ name, creationId }) }));
const added = await create('  New   shop paint 1L  '); assert.equal(added.status, 201);
const product = await added.json(); assert.equal(product.id, 1000000); assert.equal(product.name, 'New shop paint 1L');
assert.equal((await create('  New   shop paint 1L  ')).status, 200, 'Lost response retry reuses the product');
assert.equal((await create('NEW SHOP PAINT 1L', 'duplicate-product-0000')).status, 409);
assert.equal((await create(initial[0].name.toLowerCase(), 'original-duplicate-000')).status, 409);
assert.equal((await create('Different name', 'new-product-test-00000')).status, 409);
for (const name of ['', '   ', 'a'.repeat(161), null, 42]) assert.equal((await create(name)).status, 400);
assert.equal((await create('Another', 'cross-origin-create-000', 'https://other.test')).status, 403);
let all = await (await GET()).json(); assert.equal(all.length, 732); assert.equal(all.find(p => p.id === product.id).quantity, 0);
assert.equal((await send({ id: product.id, quantity: 12, version: 0, mutationId: 'custom-stock-edit-0000' })).status, 200);
all = await (await GET()).json(); assert.equal(all.find(p => p.id === product.id).quantity, 12);
assert.equal(database.prepare('SELECT count(*) AS n FROM custom_products').get().n, 1);
database.exec(readFileSync('drizzle/0001_huge_quasimodo.sql', 'utf8'));
database.exec(readFileSync('drizzle/0001_huge_quasimodo.sql', 'utf8'));
assert.equal(database.prepare('SELECT quantity FROM stock WHERE product_id = 1000000').get().quantity, 12);
console.log('PASS: custom product creation, duplicate protection, retry safety, validation, shared reads and quantity updates.');
// A failed D1 read must return a diagnostic, never a zero-filled stock list.
const previousError = console.error;
console.error = () => {};
try {
  globalThis.__stockTestEnv.DB = { prepare() { throw new D1Error('D1_SCHEMA', 400); } };
  const failed = await GET();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  assert.equal((await failed.json()).code, 'D1_SCHEMA');
} finally { console.error = previousError; }
database.close(); delete globalThis.__stockTestEnv;
console.log('PASS: 731 zero-initialized products; increment, decrement, direct entry, persistence, retries, conflicts and invalid input.');
