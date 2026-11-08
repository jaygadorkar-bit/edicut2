import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const productionOrigin = "https://edicut.com";
const reactRouterCli = resolve(appDirectory, "node_modules/@react-router/dev/bin.cjs");
const validator = resolve(scriptDirectory, "validate-prerendered-seo.mjs");
const buildEnvironment = {
  ...process.env,
  APP_URL: productionOrigin,
  APP_ENV: "production",
  EDICUT_SEO_BUILD_ORIGIN: productionOrigin,
};

function runNodeScript(script, label, env = process.env) {
  const result = spawnSync(process.execPath, [script], {
    cwd: appDirectory,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`${label} failed${result.status == null ? "" : ` (exit ${result.status})`}.\n`);
    process.exit(result.status ?? 1);
  }
}

const build = spawnSync(process.execPath, [reactRouterCli, "build"], {
  cwd: appDirectory,
  env: buildEnvironment,
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

runNodeScript(validator, "Prerender SEO validation", buildEnvironment);
