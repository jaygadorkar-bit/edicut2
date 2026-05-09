type EnvSource = Record<string, string | undefined>;

type RecaptchaContext = {
  cf?: { env?: EnvSource };
  cloudflare?: { env?: EnvSource };
};

type RecaptchaVerifyResponse = {
  success?: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function getRuntimeEnv(context?: RecaptchaContext) {
  const viteEnv = import.meta.env as EnvSource;
  const nodeEnv = globalThis.process?.env as EnvSource | undefined;

  return {
    ...viteEnv,
    ...nodeEnv,
    ...context?.cf?.env,
    ...context?.cloudflare?.env,
  };
}

export function getRecaptchaSiteKey(context?: RecaptchaContext) {
  const env = getRuntimeEnv(context);
  return env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
}

export function isRecaptchaConfigured(context?: RecaptchaContext) {
  const env = getRuntimeEnv(context);
  return Boolean(env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && env.RECAPTCHA_SECRET_KEY);
}

export async function verifyRecaptchaToken({
  context,
  token,
}: {
  context?: RecaptchaContext;
  token: FormDataEntryValue | null;
}) {
  const env = getRuntimeEnv(context);
  const secret = env.RECAPTCHA_SECRET_KEY;

  if (!env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || !secret) {
    return { success: true as const };
  }

  if (typeof token !== "string" || token.trim().length === 0) {
    return { success: false as const, error: "Security check expired. Please try again." };
  }

  const params = new URLSearchParams({
    secret,
    response: token,
  });

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    return { success: false as const, error: "Security check is unavailable. Please try again." };
  }

  const data = (await response.json()) as RecaptchaVerifyResponse;

  if (!data.success) {
    return { success: false as const, error: "Security check failed. Please try again." };
  }

  return { success: true as const };
}
