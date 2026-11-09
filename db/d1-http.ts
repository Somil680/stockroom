type D1Options = {
  accountId?: string;
  databaseId?: string;
  apiToken?: string;
};
type Parameter = string | number | null;
type QueryResult<T> = { success?: boolean; results?: T[]; error?: string };

const messages = {
  D1_ACCOUNT_CONFIG: "CLOUDFLARE_ACCOUNT_ID is missing or invalid. Set the 32-character Account ID in this Vercel environment and redeploy.",
  D1_DATABASE_CONFIG: "CLOUDFLARE_D1_DATABASE_ID is missing or invalid. Set the database UUID in this Vercel environment and redeploy.",
  D1_TOKEN_CONFIG: "CLOUDFLARE_API_TOKEN is missing. Set a Cloudflare API token with D1 Edit permission in this Vercel environment and redeploy.",
  D1_AUTH: "Cloudflare rejected database access. Check the API token, D1 permission and account scope.",
  D1_NOT_FOUND: "Cloudflare could not find the configured database. Check that the Account ID and database ID belong together.",
  D1_SCHEMA: "The stock table or required columns are missing in the configured D1 database. Check the database schema.",
  D1_RATE_LIMIT: "Cloudflare is limiting requests. Wait a moment, then retry.",
  D1_TIMEOUT: "The database request timed out. Retry to check the saved stock.",
  D1_NETWORK: "The server could not reach Cloudflare D1. Retry shortly.",
  D1_QUERY: "Cloudflare could not complete the stock query. Check the database configuration and service status.",
  D1_RESPONSE: "Cloudflare returned an unexpected database response. Retry shortly.",
  D1_UNKNOWN: "Unable to access cloud stock. Please retry.",
} as const;
type ErrorCode = keyof typeof messages;
export class D1Error extends Error {
  constructor(readonly code: ErrorCode, readonly upstreamStatus?: number) {
    super(messages[code]);
    this.name = "D1Error";
  }
}

/** Only allowlisted diagnostics leave this adapter; never forward upstream text. */
export function databaseFailure(error: unknown) {
  const failure = error instanceof D1Error ? error : new D1Error("D1_UNKNOWN");
  console.error("Stockroom database error", { code: failure.code, upstreamStatus: failure.upstreamStatus });
  return { error: failure.message, code: failure.code };
}

function queryFailure(status: number, body: unknown): D1Error {
  const data = body as { errors?: { message?: unknown }[]; result?: QueryResult<unknown>[] } | null;
  const messages = [
    ...(Array.isArray(data?.errors) ? data.errors.map(e => e?.message) : []),
    ...(Array.isArray(data?.result) ? data.result.map(r => r?.error) : []),
  ].filter((value): value is string => typeof value === "string").join(" ");
  let code: ErrorCode = "D1_QUERY";
  if (status === 401 || status === 403 || /authentication|authorization|unauthorized|invalid.*token/i.test(messages)) code = "D1_AUTH";
  else if (status === 429) code = "D1_RATE_LIMIT";
  else if (status === 404 || /database.*(?:not found|does not exist|not exist)/i.test(messages)) code = "D1_NOT_FOUND";
  else if (/no such (?:table|column)|has no column named/i.test(messages)) code = "D1_SCHEMA";
  return new D1Error(code, status);
}

/** Small server-side adapter for the parameterized statements used by Stockroom. */
export function createD1Client(options: D1Options, request: typeof fetch = fetch) {
  // Dashboard copy/paste can introduce trailing spaces or newlines.
  const accountId = options.accountId?.trim();
  const databaseId = options.databaseId?.trim();
  const apiToken = options.apiToken?.trim();
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId)) throw new D1Error("D1_ACCOUNT_CONFIG");
  if (!databaseId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId)) throw new D1Error("D1_DATABASE_CONFIG");
  if (!apiToken) throw new D1Error("D1_TOKEN_CONFIG");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function query<T>(sql: string, params: Parameter[]): Promise<{ results: T[] }> {
    // No automatic write retry: a lost response may follow a committed write.
    // Route-level mutation IDs and version checks make explicit client retries safe.
    let response: Response;
    try {
      response = await request(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      throw new D1Error(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "D1_TIMEOUT" : "D1_NETWORK");
    }
    let body: { success?: boolean; result?: QueryResult<T>[] } | null;
    try { body = await response.json(); }
    catch { throw response.ok ? new D1Error("D1_RESPONSE", response.status) : queryFailure(response.status, null); }
    const result = body?.result?.[0];
    if (!response.ok || body?.success === false || result?.success === false) throw queryFailure(response.status, body);
    if (body?.success !== true || body.result?.length !== 1 ||
        result?.success !== true || !Array.isArray(result.results)) {
      throw new D1Error("D1_RESPONSE", response.status);
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
