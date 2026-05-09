declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      execute(siteKey: string, options: { action: string }): Promise<string>;
    };
  }
}

export function getRecaptchaSiteKey() {
  return document
    .querySelector<HTMLScriptElement>("script[data-edicut-recaptcha-site-key]")
    ?.dataset.edicutRecaptchaSiteKey ?? "";
}

export async function executeRecaptcha(action: string) {
  const siteKey = getRecaptchaSiteKey();

  if (!siteKey) {
    return "";
  }

  if (!window.grecaptcha) {
    throw new Error("Security check is still loading. Please try again.");
  }

  await new Promise<void>((resolve) => window.grecaptcha?.ready(resolve));
  return window.grecaptcha.execute(siteKey, { action });
}

export async function attachRecaptchaToken(form: HTMLFormElement, action: string) {
  const token = await executeRecaptcha(action);
  let input = form.querySelector<HTMLInputElement>('input[name="g-recaptcha-response"]');

  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = "g-recaptcha-response";
    form.appendChild(input);
  }

  input.value = token;
}
