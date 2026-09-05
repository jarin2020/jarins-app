import { describe, expect, it, vi } from "vitest";
import {
  ProviderResponseTooLargeError,
  providerFetch,
  readLimitedJson,
  readLimitedText,
} from "./provider-http";

describe("provider HTTP boundaries", () => {
  it("rejects a declared oversized response before buffering it", async () => {
    const response = new Response("small", {
      headers: { "content-length": "100" },
    });
    await expect(readLimitedText(response, 10)).rejects.toBeInstanceOf(
      ProviderResponseTooLargeError,
    );
  });

  it("rejects an oversized streamed response without Content-Length", async () => {
    const response = new Response("this is larger than ten bytes");
    await expect(readLimitedText(response, 10)).rejects.toBeInstanceOf(
      ProviderResponseTooLargeError,
    );
  });

  it("parses bounded JSON", async () => {
    await expect(
      readLimitedJson<{ ok: boolean }>(new Response('{"ok":true}'), 64),
    ).resolves.toEqual({ ok: true });
  });

  it("aborts a provider request after the deadline", async () => {
    vi.useFakeTimers();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    ) as typeof fetch;
    const pending = providerFetch("https://provider.example", {}, 25);
    const rejection = expect(pending).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });
});
