declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      render(
        container: HTMLElement,
        parameters: {
          sitekey: string;
          size: "invisible";
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        }
      ): number;
      execute(widgetId: number): void;
      reset(widgetId: number): void;
    };
  }
}

const WIDGET_ID_KEY = "recaptchaWidgetId";
const RECAPTCHA_API_URL = "https://www.google.com/recaptcha/api.js?render=explicit";
const RECAPTCHA_API_TIMEOUT_MS = 12_000;
const RECAPTCHA_CHALLENGE_TIMEOUT_MS = 120_000;

let recaptchaApiPromise: Promise<void> | null = null;

export function getRecaptchaSiteKey() {
  return document
    .querySelector<HTMLScriptElement>("script[data-edicut-recaptcha-site-key]")
    ?.dataset.edicutRecaptchaSiteKey ?? "";
}

function ensureTokenInput(form: HTMLFormElement) {
  let input = form.querySelector<HTMLInputElement>('input[name="g-recaptcha-response"]');

  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = "g-recaptcha-response";
    form.appendChild(input);
  }

  return input;
}

function ensureWidgetContainer(form: HTMLFormElement, action: string) {
  const id = `recaptcha-${action}`;
  let container = form.querySelector<HTMLElement>(`[data-edicut-recaptcha-widget="${id}"]`);

  if (!container) {
    container = document.createElement("div");
    container.dataset.edicutRecaptchaWidget = id;
    container.className = "sr-only";
    form.appendChild(container);
  }

  return container;
}

function loadRecaptchaApi(siteKey: string) {
  if (window.grecaptcha) return Promise.resolve();
  if (recaptchaApiPromise) return recaptchaApiPromise;

  const existingScript = document.querySelector<HTMLScriptElement>(
    'script[src*="google.com/recaptcha/api.js"], script[src*="recaptcha.net/recaptcha/api.js"]',
  );
  const script = existingScript ?? document.createElement("script");

  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let pollId = 0;
    const timeoutId = window.setTimeout(() => {
      finish(new Error("Security check is still loading. Please try again."));
    }, RECAPTCHA_API_TIMEOUT_MS);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
      script.removeEventListener("load", checkForApi);
      script.removeEventListener("error", handleLoadError);
      if (error) reject(error);
      else resolve();
    }

    function checkForApi() {
      if (window.grecaptcha) finish();
    }

    function handleLoadError() {
      finish(new Error("Security check is unavailable. Please try again."));
    }

    script.addEventListener("load", checkForApi);
    script.addEventListener("error", handleLoadError, { once: true });
    pollId = window.setInterval(checkForApi, 50);
    checkForApi();

    if (!existingScript) {
      script.src = RECAPTCHA_API_URL;
      script.async = true;
      script.defer = true;
      script.dataset.edicutRecaptchaSiteKey = siteKey;
      document.head.appendChild(script);
    }
  });

  recaptchaApiPromise = promise;
  void promise.catch(() => {
    if (recaptchaApiPromise === promise) recaptchaApiPromise = null;
  });
  return promise;
}

export async function executeInvisibleRecaptcha(form: HTMLFormElement, action: string) {
  const siteKey = getRecaptchaSiteKey();

  if (!siteKey) {
    throw new Error("Security check is unavailable. Please try again.");
  }

  await loadRecaptchaApi(siteKey);

  await new Promise<void>((resolve) => window.grecaptcha?.ready(resolve));

  const tokenInput = ensureTokenInput(form);
  const container = ensureWidgetContainer(form, action);
  const existingWidgetId = container.dataset[WIDGET_ID_KEY];

  return new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      tokenInput.value = "";
      reject(new Error("Security check timed out. Please try again."));
    }, RECAPTCHA_CHALLENGE_TIMEOUT_MS);

    try {
      const widgetId = existingWidgetId
        ? Number(existingWidgetId)
        : window.grecaptcha!.render(container, {
            sitekey: siteKey,
            size: "invisible",
            callback: (token) => {
              tokenInput.value = token;
              window.clearTimeout(timeoutId);
              resolve(token);
            },
            "expired-callback": () => {
              tokenInput.value = "";
              window.clearTimeout(timeoutId);
              reject(new Error("Security check expired. Please try again."));
            },
            "error-callback": () => {
              tokenInput.value = "";
              window.clearTimeout(timeoutId);
              reject(new Error("Security check failed. Please try again."));
            },
          });

      container.dataset[WIDGET_ID_KEY] = String(widgetId);
      window.grecaptcha!.reset(widgetId);
      window.grecaptcha!.execute(widgetId);
    } catch {
      window.clearTimeout(timeoutId);
      reject(new Error("Security check failed. Please try again."));
    }
  });
}
