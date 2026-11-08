export const DEFAULT_SERVER_FETCH_TIMEOUT_MS = 12_000;
export const UPLOAD_FETCH_TIMEOUT_MS = 120_000;

/** Bound outbound requests so a slow provider cannot leave a route pending indefinitely. */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_SERVER_FETCH_TIMEOUT_MS,
) {
  const timeoutSignal = AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs)));
  const requestSignal = input instanceof Request ? input.signal : undefined;
  const signals = [requestSignal, init.signal, timeoutSignal].filter(
    (signal): signal is AbortSignal => Boolean(signal),
  );
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

  return fetch(input, { ...init, signal });
}

/** Bound the wait for response headers without aborting a streamed response body. */
export async function fetchWithHeadersTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_SERVER_FETCH_TIMEOUT_MS,
) {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    timeoutController.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
  }, Math.max(1, Math.floor(timeoutMs)));
  const requestSignal = input instanceof Request ? input.signal : undefined;
  const signals = [requestSignal, init.signal, timeoutController.signal].filter(
    (signal): signal is AbortSignal => Boolean(signal),
  );
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

  try {
    return await fetch(input, { ...init, signal });
  } finally {
    clearTimeout(timeout);
  }
}
