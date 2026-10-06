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
const RECAPTCHA_READY_TIMEOUT_MS = 12_000;
const RECAPTCHA_CHALLENGE_TIMEOUT_MS = 120_000;
type PendingChallenge = { complete: (token: string) => void; fail: (message: string) => void };
type WidgetState = { id: number; pending?: PendingChallenge };
const widgets = new WeakMap<HTMLElement, WidgetState>();

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

function waitForRecaptchaReady() {
  const recaptcha = window.grecaptcha;
  if (!recaptcha?.ready) {
    return Promise.reject(new Error("Security check is unavailable. Please try again."));
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Security check is still loading. Please try again."));
    }, RECAPTCHA_READY_TIMEOUT_MS);

    try {
      recaptcha.ready(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve();
      });
    } catch {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(new Error("Security check is unavailable. Please try again."));
    }
  });
}

export async function executeInvisibleRecaptcha(form: HTMLFormElement, action: string) {
  const siteKey = getRecaptchaSiteKey();

  if (!siteKey) {
    throw new Error("Security check is unavailable. Please try again.");
  }

  await loadRecaptchaApi(siteKey);
  await waitForRecaptchaReady();

  const tokenInput = ensureTokenInput(form);
  const container = ensureWidgetContainer(form, action);
  let widget = widgets.get(container);
  if (widget?.pending) throw new Error("A security check is already in progress.");

  return new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      tokenInput.value = "";
      if (widget) widget.pending = undefined;
      reject(new Error("Security check timed out. Please try again."));
    }, RECAPTCHA_CHALLENGE_TIMEOUT_MS);

    try {
      if (!widget) {
        // Google's callbacks persist with the widget. Resolve the current
        // submission, including retries after server validation fails.
        const state: WidgetState = { id: -1 };
        widget = state;
        state.id = window.grecaptcha!.render(container, {
            sitekey: siteKey,
            size: "invisible",
            callback: (token) => {
              state.pending?.complete(token);
            },
            "expired-callback": () => {
              state.pending?.fail("Security check expired. Please try again.");
            },
            "error-callback": () => {
              state.pending?.fail("Security check failed. Please try again.");
            },
          });
        widgets.set(container, state);
        container.dataset[WIDGET_ID_KEY] = String(state.id);
      }
      window.grecaptcha!.reset(widget.id);
      widget.pending = {
        complete(token) { tokenInput.value = token; window.clearTimeout(timeoutId); widget!.pending = undefined; resolve(token); },
        fail(message) { tokenInput.value = ""; window.clearTimeout(timeoutId); widget!.pending = undefined; reject(new Error(message)); },
      };
      window.grecaptcha!.execute(widget.id);
    } catch {
      window.clearTimeout(timeoutId);
      if (widget) widget.pending = undefined;
      reject(new Error("Security check failed. Please try again."));
    }
  });
}
