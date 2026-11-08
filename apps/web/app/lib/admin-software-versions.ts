export type SoftwareVersionLookup =
  | { kind: "npm"; packageName: string }
  | { kind: "node-lts" }
  | { kind: "postgres-latest-supported" };

export type AdminSoftwareVersionEntry = {
  name: string;
  category: string;
  currentVersion: string;
  latestVersion: string;
  sourceLabel: string;
  sourceUrl: string;
  lookup: SoftwareVersionLookup;
};

export type SoftwareUpdateStatus = "up-to-date" | "out-of-date" | "unavailable";

type SoftwareVersionComparison = {
  currentVersion: string;
  latestVersion: string;
  latestStatus: "automatic" | "saved-reference";
};

function numericVersion(value: string) {
  const match = value.trim().match(/^v?(\d+)\.(\d+)(?:\.(\d+))?(?:\s+.*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
}

export function getSoftwareUpdateStatus(version: SoftwareVersionComparison): SoftwareUpdateStatus {
  if (version.latestStatus !== "automatic") return "unavailable";
  const current = numericVersion(version.currentVersion);
  const latest = numericVersion(version.latestVersion);
  if (!current || !latest) return "unavailable";

  for (let index = 0; index < current.length; index += 1) {
    if (latest[index] > current[index]) return "out-of-date";
    if (latest[index] < current[index]) return "up-to-date";
  }
  return "up-to-date";
}

export function countAvailableSoftwareUpdates(versions: readonly SoftwareVersionComparison[]) {
  return versions.filter((version) => getSoftwareUpdateStatus(version) === "out-of-date").length;
}

export const adminSoftwareVersions = [
  {
    name: "Node.js",
    category: "Container runtime",
    currentVersion: "26.13.0 LTS",
    latestVersion: "26.13.0 LTS",
    sourceLabel: "Node.js releases",
    sourceUrl: "https://nodejs.org/en/about/previous-releases",
    lookup: { kind: "node-lts" },
  },
  {
    name: "pnpm",
    category: "Package manager",
    currentVersion: "12.18.0",
    latestVersion: "12.18.0",
    sourceLabel: "pnpm releases",
    sourceUrl: "https://github.com/pnpm/pnpm/releases",
    lookup: { kind: "npm", packageName: "pnpm" },
  },
  {
    name: "PostgreSQL",
    category: "Database",
    currentVersion: "unknown",
    latestVersion: "17.11",
    sourceLabel: "PostgreSQL versioning policy",
    sourceUrl: "https://www.postgresql.org/support/versioning/",
    lookup: { kind: "postgres-latest-supported" },
  },
  {
    name: "React",
    category: "UI library",
    currentVersion: "19.3.1",
    latestVersion: "19.3.1",
    sourceLabel: "React versions",
    sourceUrl: "https://react.dev/versions",
    lookup: { kind: "npm", packageName: "react" },
  },
  {
    name: "React Router",
    category: "Application framework",
    currentVersion: "8.5.1",
    latestVersion: "8.5.1",
    sourceLabel: "React Router changelog",
    sourceUrl: "https://reactrouter.com/changelog",
    lookup: { kind: "npm", packageName: "react-router" },
  },
  {
    name: "Vite",
    category: "Build tool",
    currentVersion: "8.3.6",
    latestVersion: "8.3.6",
    sourceLabel: "Vite releases",
    sourceUrl: "https://vite.dev/releases",
    lookup: { kind: "npm", packageName: "vite" },
  },
  {
    name: "TypeScript",
    category: "Compiler",
    currentVersion: "7.0.2",
    latestVersion: "7.0.2",
    sourceLabel: "TypeScript downloads",
    sourceUrl: "https://www.typescriptlang.org/download/",
    lookup: { kind: "npm", packageName: "typescript" },
  },
  {
    name: "Wrangler",
    category: "Cloudflare CLI",
    currentVersion: "4.158.0",
    latestVersion: "4.158.0",
    sourceLabel: "Wrangler releases",
    sourceUrl: "https://github.com/cloudflare/workers-sdk/releases",
    lookup: { kind: "npm", packageName: "wrangler" },
  },
  {
    name: "Supabase JS",
    category: "Database client",
    currentVersion: "2.119.0",
    latestVersion: "2.119.0",
    sourceLabel: "Supabase JS versions",
    sourceUrl: "https://www.npmjs.com/package/@supabase/supabase-js?activeTab=versions",
    lookup: { kind: "npm", packageName: "@supabase/supabase-js" },
  },
] satisfies readonly AdminSoftwareVersionEntry[];
