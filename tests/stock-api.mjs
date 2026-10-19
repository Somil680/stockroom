import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const database = new DatabaseSync(':memory:');
database.exec(readFileSync('drizzle/0000_red_northstar.sql', 'utf8'));
globalThis.__stockTestEnv = { DB: { prepare(sql) { let params = []; return { bind(...p) { params = p; return this; }, async first() { return database.prepare(sql).get(...params) ?? null; }, async all() { return { results: database.prepare(sql).all(...params) }; } }; } } };
const source = readFileSync('app/api/stock/route.ts', 'utf8').replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__stockTestEnv;').replace('import products from "@/data/products.json";', `const products = ${readFileSync('data/products.json', 'utf8')};`);
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
database.close(); delete globalThis.__stockTestEnv;
console.log('PASS: 731 zero-initialized products; increment, decrement, direct entry, persistence, retries, conflicts and invalid input.');
