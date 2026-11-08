import type { WebLoadContext } from "./lib/context.server";

declare module "react-router" {
  interface RouterContextProvider extends WebLoadContext {}
}

export {};
