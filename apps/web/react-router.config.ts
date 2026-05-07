import type { Config } from "@react-router/dev/config";

const isProduction = process.env.NODE_ENV === "production";

export default {
  appDirectory: "app",
  allowedActionOrigins: isProduction ? ["edicut.com", "www.edicut.com"] : ["**"],
  ssr: true,
  routeDiscovery: {
    mode: "initial",
  },
} satisfies Config;
