declare module "@opennextjs/cloudflare" {
  export function initOpenNextCloudflareForDev(): void;
  export function defineCloudflareConfig<TConfig extends Record<string, unknown> = Record<string, never>>(
    config?: TConfig
  ): TConfig;
}
