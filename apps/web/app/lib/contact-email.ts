export const DEFAULT_CONTACT_EMAIL = "edicutstudio@gmail.com";

type ContactEmailContext = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

export function getConfiguredContactEmail(context: unknown) {
  const runtimeContext = context as ContactEmailContext | undefined;
  const processEnv = (globalThis.process as { env?: Record<string, string | undefined> } | undefined)?.env;
  const env = {
    ...processEnv,
    ...runtimeContext?.cf?.env,
    ...runtimeContext?.cloudflare?.env,
  };
  const configuredEmail = env.GMAIL_SENDER_EMAIL?.trim();

  return configuredEmail && /^[^\s@<>;"'()]+@[^\s@<>;"'()]+\.[^\s@<>;"'()]+$/.test(configuredEmail)
    ? configuredEmail
    : DEFAULT_CONTACT_EMAIL;
}
