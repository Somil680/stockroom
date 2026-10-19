import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const catalogue = JSON.parse(readFileSync('data/products.json', 'utf8'));
function moduleURL(source) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(output).toString('base64');
}
const backupURL = moduleURL(readFileSync('lib/backup.ts', 'utf8').replace('import catalogue from "@/data/products.json";', `const catalogue = ${JSON.stringify(catalogue)};`));
const helpers = await import(backupURL);
const zero = catalogue.map(p => ({ ...p, quantity: 0, version: 0 }));
const backup = helpers.createBackup(zero, '2026-10-18T13:00:00.000Z');
assert.deepEqual(helpers.parseBackup(JSON.stringify(backup)), backup);
assert.throws(() => helpers.parseBackup('{}'));
assert.throws(() => helpers.parseBackup('{bad'));
assert.throws(() => helpers.createBackup([]));
for (const mutation of [p => { p.quantity = -1; }, p => { p.quantity = 1.2; }, p => { p.quantity = '2'; }, p => { p.version = -1; }, p => { p.name = 'wrong name'; }, p => { p.id = 99999; }]) {
  const bad = structuredClone(backup); mutation(bad.products[0]); assert.throws(() => helpers.validateBackup(bad));
}
const duplicate = structuredClone(backup); duplicate.products[1] = duplicate.products[0]; assert.throws(() => helpers.validateBackup(duplicate));
const fakeStorage = new Map();
const storage = { getItem: key => fakeStorage.get(key) ?? null, setItem: (key, value) => fakeStorage.set(key, value) };
assert.equal(helpers.readSnapshot(storage), null);
helpers.writeSnapshot(storage, backup); assert.deepEqual(helpers.readSnapshot(storage), backup);
assert.throws(() => helpers.writeSnapshot({ setItem() { throw new Error('Storage blocked'); } }, backup));
fakeStorage.set(helpers.SNAPSHOT_KEY, '{}'); assert.throws(() => helpers.readSnapshot(storage));
assert.equal(helpers.mergeConfirmed([{ ...zero[0], quantity: 10, version: 2 }], [{ ...zero[0], quantity: 5, version: 1 }])[0].quantity, 10);
const database = new DatabaseSync(':memory:');
database.exec(readFileSync('drizzle/0000_red_northstar.sql', 'utf8'));
globalThis.__stockTestEnv = { DB: { prepare(sql) { let params = []; return { bind(...p) { params = p; return this; }, async first() { return database.prepare(sql).get(...params) ?? null; }, async all() { return { results: database.prepare(sql).all(...params) }; } }; } } };
const restoreSource = readFileSync('app/api/stock/restore/route.ts', 'utf8').replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__stockTestEnv;').replace('"@/lib/backup"', JSON.stringify(backupURL));
const { POST } = await import(moduleURL(restoreSource));
function current() { const byId = new Map(database.prepare('SELECT * FROM stock').all().map(p => [p.product_id, p])); return zero.map(p => ({ ...p, quantity: byId.get(p.id)?.quantity ?? 0, version: byId.get(p.id)?.version ?? 0 })); }
const send = (backup, expected, mutationId = 'restore-test-00000000', origin = 'https://shop.test') => POST(new Request('https://shop.test/api/stock/restore', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify({ backup, expected, mutationId }) }));
const populated = helpers.createBackup(zero.map(p => ({ ...p, quantity: p.id + 10 })));
const first = await send(populated, zero); assert.equal(first.status, 200); assert.equal((await first.json()).restored, 731);
assert.ok(current().every(p => p.quantity === p.id + 10 && p.version === 1));
const replay = await send(populated, zero); assert.equal(replay.status, 200); assert.equal((await replay.json()).alreadyApplied, true); assert.ok(current().every(p => p.version === 1));
const oldPreview = current();
database.prepare('UPDATE stock SET quantity = 999, version = version + 1 WHERE product_id = 731').run();
const beforeConflict = current();
const conflict = await send(backup, oldPreview, 'restore-conflict-00000'); assert.equal(conflict.status, 409); assert.deepEqual(current(), beforeConflict, 'No row may change when even the last previewed row is stale');
const invalid = structuredClone(populated); invalid.products[0].quantity = -20;
assert.equal((await send(invalid, current())).status, 400); assert.deepEqual(current(), beforeConflict);
assert.equal((await send(populated, current(), 'restore-csrf-test-000', 'https://other.test')).status, 403);
const second = await send(backup, current(), 'restore-zero-test-00000'); assert.equal(second.status, 200); assert.equal((await second.json()).restored, 731); assert.ok(current().every(p => p.quantity === 0));
database.close(); delete globalThis.__stockTestEnv;
console.log('PASS: snapshot validation, blocked storage, stale-response merge, all-731 atomic restore, retry, stale preview rejection, invalid file rejection and cross-origin rejection.');
