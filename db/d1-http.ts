type D1Options = {
  accountId?: string;
  databaseId?: string;
  apiToken?: string;
};
type Parameter = string | number | null;
type QueryResult<T> = { success?: boolean; results?: T[] };

/** Small server-side adapter for the parameterized statements used by Stockroom. */
export function createD1Client(options: D1Options, request: typeof fetch = fetch) {
  const { accountId, databaseId, apiToken } = options;
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) ||
      !databaseId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId) ||
      !apiToken?.trim()) {
    throw new Error("Cloudflare D1 environment variables are missing or invalid.");
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function query<T>(sql: string, params: Parameter[]): Promise<{ results: T[] }> {
    // No automatic write retry: a lost response may follow a committed write.
    // Route-level mutation IDs and version checks make explicit client retries safe.
    const response = await request(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`D1 request failed (${response.status}).`);
    const body: { success?: boolean; result?: QueryResult<T>[] } = await response.json();
    const result = body?.result?.[0];
    if (body?.success !== true || body.result?.length !== 1 ||
        result?.success !== true || !Array.isArray(result.results)) {
      // Never return upstream errors, SQL, headers or credentials to the browser.
      throw new Error("D1 returned an unsuccessful or invalid query result.");
    }
    return { results: result.results };
  }

  function statement(sql: string, params: Parameter[] = []) {
    return {
      bind(...values: Parameter[]) { return statement(sql, values); },
      all<T = Record<string, unknown>>() { return query<T>(sql, params); },
      async first<T = Record<string, unknown>>(): Promise<T | null> {
        return (await query<T>(sql, params)).results[0] ?? null;
      },
    };
  }
  return { prepare: (sql: string) => statement(sql) };
}
