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

export async function executeInvisibleRecaptcha(form: HTMLFormElement, action: string) {
  const siteKey = getRecaptchaSiteKey();

  if (!siteKey) {
    return "";
  }

  if (!window.grecaptcha) {
    throw new Error("Security check is still loading. Please try again.");
  }

  await new Promise<void>((resolve) => window.grecaptcha?.ready(resolve));

  const tokenInput = ensureTokenInput(form);
  const container = ensureWidgetContainer(form, action);
  const existingWidgetId = container.dataset[WIDGET_ID_KEY];

  return new Promise<string>((resolve, reject) => {
    const widgetId = existingWidgetId
      ? Number(existingWidgetId)
      : window.grecaptcha!.render(container, {
          sitekey: siteKey,
          size: "invisible",
          callback: (token) => {
            tokenInput.value = token;
            resolve(token);
          },
          "expired-callback": () => {
            tokenInput.value = "";
            reject(new Error("Security check expired. Please try again."));
          },
          "error-callback": () => {
            tokenInput.value = "";
            reject(new Error("Security check failed. Please try again."));
          },
        });

    container.dataset[WIDGET_ID_KEY] = String(widgetId);
    window.grecaptcha!.reset(widgetId);
    window.grecaptcha!.execute(widgetId);
  });
}
