const webBaseUrl = (process.env.WEB_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const nodeApiBaseUrl = (process.env.NODE_API_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
const serviceSecret = process.env.SERVICE_SHARED_SECRET || "";

async function expectStatus(name, response, allowed = [200]) {
  if (!allowed.includes(response.status)) {
    throw new Error(`${name} failed with status ${response.status}`);
  }
}

async function main() {
  const homepage = await fetch(`${webBaseUrl}/`);
  await expectStatus("homepage", homepage);

  const health = await fetch(`${webBaseUrl}/health`);
  await expectStatus("web-health", health);

  const dashboard = await fetch(`${webBaseUrl}/dashboard`);
  await expectStatus("dashboard-shell", dashboard);

  const admin = await fetch(`${webBaseUrl}/admin`);
  await expectStatus("admin-shell", admin);

  if (serviceSecret) {
    const nodeHealth = await fetch(`${nodeApiBaseUrl}/api/node/health`, {
      headers: {
        "x-edicut-service-token": serviceSecret,
      },
    });
    await expectStatus("node-health", nodeHealth);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: ["homepage", "web-health", "dashboard-shell", "admin-shell", "node-health"],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
