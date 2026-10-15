import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { prepareDockerDev } from "./docker-dev.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "edicut-docker-test-"));
  t.after(() => {
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}edicut-docker-test-`));
    rmSync(root, { recursive: true, force: true });
  });
  function write(file, text = "{}") {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  for (const file of [
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json", "Dockerfile",
    "apps/web/package.json", "apps/node-api/package.json", "packages/platform-core/package.json",
    "node_modules/.bin/tsc", "apps/web/node_modules/.bin/react-router",
    ...["shared", "db"].flatMap((name) => [
      `packages/${name}/package.json`, `packages/${name}/tsconfig.json`, `packages/${name}/src/index.ts`,
    ]),
  ]) write(file);
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[0] === "--filter") {
      const name = args[1].split("/")[1];
      write(`packages/${name}/dist/index.js`, "export {};");
      write(`packages/${name}/dist/index.d.ts`, "export {};");
    }
  };
  const prepare = () => prepareDockerDev({ root, run, log: () => {} });
  return { root, write, calls, run, prepare };
}

test("first start prepares everything; unchanged restarts do no install or builds", (t) => {
  const f = fixture(t);
  f.prepare();
  assert.equal(f.calls.length, 3);
  f.calls.length = 0;
  f.prepare();
  assert.equal(f.calls.length, 0);
});

test("a shared source change rebuilds shared and its database dependent", (t) => {
  const f = fixture(t);
  f.prepare(); f.calls.length = 0;
  f.write("packages/shared/src/new.ts", "export const added = true;");
  f.prepare();
  assert.deepEqual(f.calls.map((args) => args[1]), ["@edicut/shared", "@edicut/db"]);
});

test("database source/config changes rebuild only the database; deleted sources invalidate it", (t) => {
  const f = fixture(t);
  f.prepare(); f.calls.length = 0;
  f.write("packages/db/tsconfig.json", '{"compilerOptions":{}}');
  f.prepare();
  assert.deepEqual(f.calls.map((args) => args[1]), ["@edicut/db"]);
  f.calls.length = 0;
  rmSync(join(f.root, "packages/db/src/index.ts"));
  f.write("packages/db/src/replacement.ts");
  f.prepare();
  assert.deepEqual(f.calls.map((args) => args[1]), ["@edicut/db"]);
});

test("lockfile changes and missing workspace volume stamps trigger reinstall", (t) => {
  const f = fixture(t);
  f.prepare(); f.calls.length = 0;
  f.write("pnpm-lock.yaml", "changed");
  f.prepare();
  assert.equal(f.calls[0][0], "install");
  f.calls.length = 0;
  rmSync(join(f.root, "apps/node-api/node_modules/.edicut-dependencies"));
  f.prepare();
  assert.deepEqual(f.calls.map((args) => args[0]), ["install"]);
});

test("deleted or damaged build outputs are repaired even with unchanged source", (t) => {
  const f = fixture(t);
  f.prepare(); f.calls.length = 0;
  rmSync(join(f.root, "packages/db/dist/index.d.ts"));
  f.prepare();
  assert.deepEqual(f.calls.map((args) => args[1]), ["@edicut/db"]);
  f.calls.length = 0;
  f.write("packages/shared/dist/index.js", "damaged");
  f.prepare();
  assert.deepEqual(f.calls.map((args) => args[1]), ["@edicut/shared"]);
});

test("failed installs never mark dependencies as ready", (t) => {
  const f = fixture(t);
  const fail = () => { throw new Error("install failed"); };
  assert.throws(() => prepareDockerDev({ root: f.root, run: fail, log: () => {} }), /install failed/);
  f.prepare();
  assert.equal(f.calls[0][0], "install");
});

test("failed builds are retried instead of caching stale outputs", (t) => {
  const f = fixture(t);
  f.prepare();
  f.write("packages/shared/src/index.ts", "changed");
  const run = () => { throw new Error("build failed"); };
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.throws(() => prepareDockerDev({ root: f.root, run, log: () => {} }), /build failed/);
  }
  f.calls.length = 0;
  f.prepare();
  assert.deepEqual(f.calls.map((args) => args[1]), ["@edicut/shared", "@edicut/db"]);
});
