const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RESPONSE_LIMIT = 8 * 1024 * 1024;

export class ProviderResponseTooLargeError extends Error {
  constructor(readonly maximumBytes: number) {
    super(`Provider response exceeded ${maximumBytes} bytes.`);
    this.name = "ProviderResponseTooLargeError";
  }
}

/** Fetch an external provider without allowing a stalled socket to pin a Worker. */
export async function providerFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(
    () => controller.abort("Provider timed out"),
    timeoutMs,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/** Read a response with a hard byte ceiling, even when Content-Length is absent. */
export async function readLimitedBytes(
  response: Response,
  maximumBytes = DEFAULT_RESPONSE_LIMIT,
) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new ProviderResponseTooLargeError(maximumBytes);
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ProviderResponseTooLargeError(maximumBytes);
    }
    chunks.push(chunk.value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function readLimitedText(
  response: Response,
  maximumBytes = DEFAULT_RESPONSE_LIMIT,
) {
  return new TextDecoder().decode(
    await readLimitedBytes(response, maximumBytes),
  );
}

export async function readLimitedJson<T>(
  response: Response,
  maximumBytes = DEFAULT_RESPONSE_LIMIT,
) {
  const text = await readLimitedText(response, maximumBytes);
  return JSON.parse(text) as T;
}
