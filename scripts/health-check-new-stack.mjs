const webBaseUrl = (process.env.WEB_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const nodeApiBaseUrl = (process.env.NODE_API_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
const serviceSecret = process.env.SERVICE_SHARED_SECRET || "";

async function check(name, url, init) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${name} failed with ${response.status}`);
  }

  const body = await response.json();
  return { name, body };
}

async function main() {
  const results = [];

  results.push(await check("web-health", `${webBaseUrl}/health`));

  if (serviceSecret) {
    results.push(
      await check("node-health", `${nodeApiBaseUrl}/api/node/health`, {
        headers: {
          "x-edicut-service-token": serviceSecret,
        },
      })
    );

    results.push(
      await check("node-usage-metrics", `${nodeApiBaseUrl}/api/node/metrics/usage`, {
        headers: {
          "x-edicut-service-token": serviceSecret,
        },
      })
    );
  }

  console.log(JSON.stringify({ ok: true, checks: results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
