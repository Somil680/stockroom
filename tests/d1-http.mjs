import assert from 'node:assert/strict';
import { createD1Client, config } from './d1-test-client.mjs';
for (const invalid of [{}, { ...config, accountId: 'bad/id' }, { ...config, databaseId: 'bad' }, { ...config, apiToken: '' }]) {
  assert.throws(() => createD1Client(invalid), /environment variables/);
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
