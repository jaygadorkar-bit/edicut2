import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  ssr: true,
  prerender: ["/"],
  routeDiscovery: {
    mode: "initial",
  },
} satisfies Config;
