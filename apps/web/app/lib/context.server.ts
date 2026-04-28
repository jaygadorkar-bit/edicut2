export type WebEnv = {
  APP_URL?: string;
  NODE_API_BASE_URL?: string;
};

export type WebLoadContext = {
  cf: {
    env: Record<string, string | undefined>;
    ctx: ExecutionContext;
  };
  env: WebEnv;
};

export function createWebLoadContext(args: {
  env: Record<string, string | undefined>;
  ctx: ExecutionContext;
}): WebLoadContext {
  return {
    cf: {
      env: args.env,
      ctx: args.ctx,
    },
    env: {
      APP_URL: args.env.APP_URL ?? "http://127.0.0.1:4174",
      NODE_API_BASE_URL: args.env.NODE_API_BASE_URL ?? "http://127.0.0.1:8787/api/node",
    },
  };
}

export function resolveWebEnv(context?: Pick<WebLoadContext, "env">): WebEnv {
  return (
    context?.env ?? {
      APP_URL: process.env.APP_URL ?? "http://127.0.0.1:4174",
      NODE_API_BASE_URL:
        process.env.NODE_API_BASE_URL ?? "http://127.0.0.1:8787/api/node",
    }
  );
}