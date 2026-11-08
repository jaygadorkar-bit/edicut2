import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sources(path)
      : /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)
        ? [path]
        : [];
  });
}
describe("site-wide dropdown adoption", () => {
  it("keeps native select markup confined to the shared, hidden form adapter", () => {
    const found = sources(resolve("apps/web/app")).filter((path) =>
      /<select\b/.test(readFileSync(path, "utf8")),
    );
    expect(
      found.map((path) => path.replaceAll("\\", "/").split("/").at(-1)),
    ).toEqual(["Select.tsx"]);
  });
});
