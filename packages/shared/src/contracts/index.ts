export const SERVICE_AUTH_HEADER = "x-edicut-service-token";

export const runtimeTargets = ["cloudflare", "vercel-node"] as const;
export const projectStatuses = ["draft", "published", "archived"] as const;

export type RuntimeTarget = (typeof runtimeTargets)[number];
export type ProjectStatus = (typeof projectStatuses)[number];
