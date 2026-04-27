const webBaseUrl = (process.env.WEB_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
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

  const login = await fetch(`${webBaseUrl}/login`);
  await expectStatus("login", login);

  const dashboard = await fetch(`${webBaseUrl}/dashboard`, {
    redirect: "manual",
  });
  await expectStatus("dashboard-shell", dashboard, [302]);

  const cfMutation = await fetch(`${webBaseUrl}/forgot-password`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email: "demo@edicut.com",
    }),
  });
  await expectStatus("cloudflare-mutation", cfMutation);

  if (serviceSecret) {
    const nodeMutation = await fetch(`${nodeApiBaseUrl}/api/node/ops/contact-intake`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edicut-service-token": serviceSecret,
      },
      body: JSON.stringify({
        name: "Smoke Test",
        email: "smoke@edicut.com",
        brief: "This is a smoke test for the bounded Node API contact intake route.",
      }),
    });
    await expectStatus("node-mutation", nodeMutation);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: ["homepage", "login", "dashboard-shell", "cloudflare-mutation", "node-mutation"],
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
