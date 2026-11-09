import assert from 'node:assert/strict';
import { createD1Client, config, D1Error, databaseFailure } from './d1-test-client.mjs';
for (const invalid of [{}, { ...config, accountId: 'bad/id' }, { ...config, databaseId: 'bad' }, { ...config, apiToken: '' }]) {
  assert.throws(() => createD1Client(invalid), /CLOUDFLARE_/);
}
for (const failure of [
  () => new Response('rate limited', { status: 429 }),
  () => new Response('forbidden', { status: 403 }),
  () => Response.json({ success: false, errors: [{ message: 'sensitive upstream text' }] }),
  () => Response.json({ success: true, result: [{ success: false, results: [] }] }),
  () => Response.json({ success: true, result: [{ success: true }] }),
  () => Response.json({ success: true, result: [] }),
  () => Response.json({ success: true, result: [{ success: true, results: [] }, { success: true, results: [] }] }),
  () => new Response('invalid-json'),
  () => { throw new DOMException('Timed out', 'TimeoutError'); },
]) {
  let requests = 0;
  const client = createD1Client(config, async () => { requests++; return failure(); });
  await assert.rejects(client.prepare('UPDATE stock SET quantity = ?').bind(1).all());
  assert.equal(requests, 1, 'A failed write must not be automatically replayed');
}
const params = [];
const client = createD1Client(config, async (_, options) => {
  params.push(JSON.parse(options.body).params);
  return Response.json({ success: true, result: [{ success: true, results: [] }] });
});
const stmt = client.prepare('SELECT ?');
assert.equal(await stmt.bind("x'); DROP TABLE stock; --").first(), null);
await stmt.bind(2).all(); await stmt.all();
assert.deepEqual(params, [["x'); DROP TABLE stock; --"], [2], []], 'Binding keeps values separate from SQL and statements immutable');
console.log('PASS: D1 HTTP config validation, parameter binding, failure handling, response shape validation and no implicit write retries.');

// Dashboard whitespace must not change the endpoint or Authorization header.
await createD1Client(Object.fromEntries(Object.entries(config).map(([k, v]) => [k, ` \n${v} \n`])), async (url, options) => {
  assert.ok(url.includes(`/accounts/${config.accountId}/d1/database/${config.databaseId}/query`));
  assert.equal(options.headers.Authorization, `Bearer ${config.apiToken}`);
  return Response.json({ success: true, result: [{ success: true, results: [] }] });
}).prepare('SELECT 1').all();
const cases = [
  [403, { success: false, errors: [{ message: 'secret upstream token' }] }, 'D1_AUTH'],
  [400, { success: false, errors: [{ message: 'Authentication error' }] }, 'D1_AUTH'],
  [404, {}, 'D1_NOT_FOUND'],
  [429, {}, 'D1_RATE_LIMIT'],
  [400, { success: false, errors: [{ message: 'no such table: stock: SQLITE_ERROR' }] }, 'D1_SCHEMA'],
  [200, { success: false, errors: [{ message: 'no such column: version' }] }, 'D1_SCHEMA'],
  [200, { success: true, result: [{ success: false, error: 'no such table: stock' }] }, 'D1_SCHEMA'],
  [500, { success: false, errors: [{ message: 'secret upstream SQL' }] }, 'D1_QUERY'],
  [200, { success: true, result: [] }, 'D1_RESPONSE'],
];
const logs = [];
const logError = console.error;
console.error = (...args) => logs.push(args);
try {
  for (const [status, body, code] of cases) {
    await assert.rejects(createD1Client(config, async () => Response.json(body, { status })).prepare('SELECT * FROM stock').all(), error => {
      assert.ok(error instanceof D1Error);
      const diagnostic = databaseFailure(error);
      assert.equal(diagnostic.code, code);
      assert.ok(!JSON.stringify(diagnostic).includes('secret upstream'));
      return true;
    });
  }
  assert.equal(databaseFailure(new Error('SECRET_UNEXPECTED')).code, 'D1_UNKNOWN');
  assert.ok(!JSON.stringify(logs).includes('secret upstream'));
  assert.ok(!JSON.stringify(logs).includes('SECRET_UNEXPECTED'));
} finally { console.error = logError; }
console.log('PASS: padded environment values, auth/schema/rate-limit diagnostics and secret-safe logging.');
