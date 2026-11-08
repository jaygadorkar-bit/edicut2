import { RouterContextProvider } from "react-router";

export type WebEnv = {
  APP_URL?: string;
  NODE_API_BASE_URL?: string;
  DEBUG_MODE?: string;
};

export type WebLoadContext = {
  cf: {
    env: Record<string, string | undefined>;
    ctx: ExecutionContext;
  };
  env: WebEnv;
};

class WebLoadContextProvider extends RouterContextProvider implements WebLoadContext {
  cf: WebLoadContext["cf"];
  env: WebEnv;

  constructor(args: { env: Record<string, string | undefined>; ctx: ExecutionContext }) {
    super();
    this.cf = { env: args.env, ctx: args.ctx };
    this.env = {
      APP_URL: args.env.APP_URL ?? "http://localhost:3002",
      NODE_API_BASE_URL: args.env.NODE_API_BASE_URL ?? "http://127.0.0.1:8787/api/node",
      DEBUG_MODE: args.env.DEBUG_MODE ?? "false",
    };
  }
}

export function createWebLoadContext(args: {
  env: Record<string, string | undefined>;
  ctx: ExecutionContext;
}): WebLoadContextProvider {
  return new WebLoadContextProvider(args);
}

export function resolveWebEnv(context?: Pick<WebLoadContext, "env">): WebEnv {
  return (
    context?.env ?? {
      APP_URL: process.env.APP_URL ?? "http://localhost:3002",
      NODE_API_BASE_URL:
        process.env.NODE_API_BASE_URL ?? "http://127.0.0.1:8787/api/node",
      DEBUG_MODE: process.env.DEBUG_MODE ?? "false",
    }
  );
}
