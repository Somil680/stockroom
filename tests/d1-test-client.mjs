import ts from 'typescript';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = ts.transpileModule(readFileSync('db/d1-http.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
export const { createD1Client } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
export const config = { accountId: 'a'.repeat(32), databaseId: '11111111-1111-4111-8111-111111111111', apiToken: 'TEST_ONLY_NOT_A_REAL_TOKEN' };
export function testClient(database) {
  return createD1Client(config, async (url, options) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${config.apiToken}`);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    const { sql, params } = JSON.parse(options.body);
    return Response.json({ success: true, result: [{ success: true, results: database.prepare(sql).all(...params) }] });
  });
}
