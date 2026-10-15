/** Node development only. The live Worker uses its native CHAT_D1 binding,
 * with no management token in the deployed environment. */
export function createRemoteChatD1(account: string, database: string, token: string): D1Database {
  if (!/^[0-9a-f]{32}$/.test(account) || !/^[0-9a-f-]{36}$/.test(database) || !token) throw new Error("Development D1 configuration is unavailable");
  type Query = { sql: string; params: unknown[] };
  const statements = new WeakMap<object, Query>();
  async function execute(batch: Query[]) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ batch }), signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json() as { success: boolean; result?: D1Result[] };
    if (!response.ok || !result.success || result.result?.length !== batch.length || result.result.some(row => !row.success)) throw new Error("Development D1 query failed");
    return result.result;
  }
  function prepare(sql: string, params: unknown[] = []): D1PreparedStatement {
    const statement = {
      bind: (...values: unknown[]) => prepare(sql, values),
      all: async () => (await execute([{ sql, params }]))[0],
      run: async () => (await execute([{ sql, params }]))[0],
      first: async (column?: string) => {
        const row = (await execute([{ sql, params }]))[0].results[0] as Record<string, unknown> | undefined;
        return column ? row?.[column] ?? null : row ?? null;
      },
    } as D1PreparedStatement;
    statements.set(statement, { sql, params });
    return statement;
  }
  return { prepare, batch: (batch: D1PreparedStatement[]) => execute(batch.map(statement => {
    const query = statements.get(statement); if (!query) throw new Error("Foreign D1 development statement"); return query;
  })) } as D1Database;
}

export function chatEnvironment(context?: unknown): Record<string, unknown> {
  return (context as { cf?: { env?: Record<string, unknown> } } | undefined)?.cf?.env ?? globalThis.process?.env ?? {};
}
export function chatD1Binding(context?: unknown): D1Database | undefined {
  const env = chatEnvironment(context);
  if (env.CHAT_D1 && typeof (env.CHAT_D1 as D1Database).prepare === "function") return env.CHAT_D1 as D1Database;
  if (globalThis.process?.env?.NODE_ENV === "development" && env.CHAT_D1_REMOTE === "true") return createRemoteChatD1(String(env.CLOUDFLARE_ACCOUNT_ID ?? ""), String(env.CHAT_D1_DATABASE_ID ?? ""), String(env.CLOUDFLARE_CHAT_DEV_API_TOKEN ?? ""));
  return undefined;
}
