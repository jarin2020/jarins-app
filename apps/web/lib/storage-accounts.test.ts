import { describe, expect, it } from "vitest";
import {
  formatStorageSize,
  storageProviderLabels,
  storageProviders,
} from "./storage-accounts";

describe("VAULT storage metadata", () => {
  it("offers each implemented storage provider", () => {
    expect(storageProviders).toEqual([
      "google-drive",
      "onedrive",
      "dropbox",
      "webdav",
    ]);
    expect(
      storageProviders.map((provider) => storageProviderLabels[provider]),
    ).toEqual([
      "Google Drive",
      "Microsoft OneDrive",
      "Dropbox",
      "WebDAV / custom",
    ]);
  });

  it("formats provider sizes without claiming folders use local storage", () => {
    expect(formatStorageSize(null)).toBe("—");
    expect(formatStorageSize(0)).toBe("0 B");
    expect(formatStorageSize(1536)).toBe("1.5 KB");
    expect(formatStorageSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatStorageSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
});
