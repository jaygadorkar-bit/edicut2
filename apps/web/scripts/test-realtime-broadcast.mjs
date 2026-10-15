import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "dotenv";
import postgres from "postgres";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
const cliArgs = process.platform === "win32"
  ? ["/d", "/c", "npx --yes supabase@2.121.0 status --output env"]
  : ["--yes", "supabase@2.121.0", "status", "--output", "env"];
const cliResult = spawnSync(
  cli,
  cliArgs,
  { cwd: repoRoot, encoding: "utf8", windowsHide: true },
);

if (cliResult.error || cliResult.status !== 0) {
  throw new Error("Could not read local Supabase status. Start the local Supabase stack first.");
}

const localEnv = parse(cliResult.stdout);
const supabaseUrl = localEnv.API_URL ?? localEnv.SUPABASE_URL;
const databaseUrl = localEnv.DB_URL ?? localEnv.DATABASE_URL;
const publishableKey = localEnv.PUBLISHABLE_KEY ?? localEnv.ANON_KEY ?? localEnv.SUPABASE_ANON_KEY;
const serviceKey = localEnv.SERVICE_ROLE_KEY ?? localEnv.SECRET_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !databaseUrl || !publishableKey || !serviceKey) {
  throw new Error("Local Supabase status did not include the API URL, database URL, and local API keys.");
}
const apiHost = new URL(supabaseUrl).hostname;
const databaseHost = new URL(databaseUrl).hostname;
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!localHosts.has(apiHost) || !localHosts.has(databaseHost)) {
  throw new Error("Refusing to run the smoke test against a non-local Supabase project.");
}

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const identities = [0, 1].map(() => ({
  email: `realtime-smoke-${randomUUID()}@example.test`,
  password: `${randomBytes(32).toString("base64url")}Aa1!`,
}));
const database = postgres(databaseUrl, { max: 1, idle_timeout: 5 });
const userIds = [];
const clients = [];
const channels = [];
let insertedProjectId;

function assertOk(result, action) {
  if (result.error) throw new Error(`${action} failed: ${result.error.message}`);
  return result.data;
}

function subscribe(client, topic, eventCount) {
  const channel = client.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: "workspace-invalidated" }, () => eventCount.hit());
  channels.push({ client, channel });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out joining private topic ${topic.split(":")[1]}.`)), 12_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve(status);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        resolve(status);
      }
    });
  });
}

const eventCounters = [0, 0].map(() => ({ count: 0, hit() { this.count += 1; } }));

try {
  for (const identity of identities) {
    const created = assertOk(await adminClient.auth.admin.createUser({
      ...identity,
      email_confirm: true,
    }), "Create local test identity");
    userIds.push(created.user.id);
    await database`
      INSERT INTO public.users (id, email, name, active)
      VALUES (${created.user.id}, ${identity.email}, 'Realtime smoke test', true)
    `;

    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    assertOk(await client.auth.signInWithPassword(identity), "Sign in local test identity");
    clients.push(client);
  }

  const topics = userIds.map((id) => `edicut:user:${id}`);
  const ownJoinStatuses = await Promise.all(clients.map((client, index) =>
    subscribe(client, topics[index], eventCounters[index])
  ));
  if (ownJoinStatuses.some((status) => status !== "SUBSCRIBED")) {
    throw new Error("An authenticated user could not join its own private Realtime topic.");
  }

  const crossTenantStatus = await subscribe(clients[1], topics[0], { hit() {} });
  if (crossTenantStatus !== "CHANNEL_ERROR") {
    throw new Error(`Cross-user private-topic join was expected to fail, received ${crossTenantStatus}.`);
  }

  const [project] = await database`
    INSERT INTO public.workspace_projects (owner_id, title, channel_name, package_slug)
    VALUES (${userIds[0]}, 'Local Realtime smoke test', 'Local-only test', 'realtime-smoke-test')
    RETURNING id
  `;
  insertedProjectId = project.id;

  const deliveryDeadline = Date.now() + 12_000;
  while (eventCounters[0].count === 0 && Date.now() < deliveryDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (eventCounters[0].count === 0) {
    throw new Error("The project trigger did not deliver an invalidation to its owner.");
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (eventCounters[1].count !== 0) {
    throw new Error("A different authenticated user received the owner's project invalidation.");
  }

  console.log("PASS: both authenticated users joined only their own private topics.");
  console.log("PASS: a project write delivered its invalidation to the owner and not the other user.");
} finally {
  await Promise.all(channels.map(({ client, channel }) => client.removeChannel(channel).catch(() => undefined)));
  for (const client of clients) client.realtime.disconnect();
  adminClient.realtime.disconnect();
  if (insertedProjectId) {
    await database`DELETE FROM public.workspace_projects WHERE id = ${insertedProjectId}`;
  }
  if (userIds.length > 0) {
    for (const userId of userIds) {
      await database`DELETE FROM public.users WHERE id = ${userId}`;
    }
    await Promise.all(userIds.map((id) => adminClient.auth.admin.deleteUser(id)));
  }
  await database.end();
}
