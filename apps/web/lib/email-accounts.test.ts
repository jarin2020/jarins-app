import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_ACCOUNTS_EVENT,
  emailAccountsKey,
  readEmailAccounts,
  writeEmailAccounts,
  type EmailAccount,
} from "./email-accounts";

const account: EmailAccount = {
  id: "mailbox-1",
  provider: "gmail",
  address: "faria@example.com",
  label: "Personal",
  createdAt: "2026-09-04T12:00:00.000Z",
};

describe("email account persistence", () => {
  beforeEach(() => localStorage.clear());

  it("keeps mailbox lists scoped to the signed-in account", () => {
    writeEmailAccounts("user-a", [account]);

    expect(readEmailAccounts("user-a")).toEqual([account]);
    expect(readEmailAccounts("user-b")).toEqual([]);
    expect(emailAccountsKey("user-a")).not.toBe(emailAccountsKey("user-b"));
  });

  it("rejects malformed stored mailbox data", () => {
    localStorage.setItem(emailAccountsKey("user-a"), JSON.stringify([{}]));
    expect(readEmailAccounts("user-a")).toEqual([]);
  });

  it("announces mailbox changes", () => {
    const listener = vi.fn();
    window.addEventListener(EMAIL_ACCOUNTS_EVENT, listener);
    writeEmailAccounts("user-a", [account]);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(EMAIL_ACCOUNTS_EVENT, listener);
  });
});
