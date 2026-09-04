import { beforeEach, describe, expect, it } from "vitest";
import {
  appendThreadMessage,
  createMessageThread,
  messagesKey,
  readMessageThreads,
} from "./messages";

describe("message thread persistence", () => {
  beforeEach(() => localStorage.clear());

  it("keeps threads scoped to the current account", () => {
    createMessageThread("user-a", { title: "Family", kind: "team" });

    expect(readMessageThreads("user-a")).toHaveLength(1);
    expect(readMessageThreads("user-b")).toEqual([]);
    expect(messagesKey("user-a")).not.toBe(messagesKey("user-b"));
  });

  it("appends messages to the selected thread", () => {
    const thread = createMessageThread("user-a", {
      title: "Alex",
      kind: "person",
    });
    appendThreadMessage("user-a", thread.id, {
      text: "Can you pick up the parcel?",
      author: "Faria",
    });

    expect(readMessageThreads("user-a")[0]?.messages).toMatchObject([
      { text: "Can you pick up the parcel?", author: "Faria" },
    ]);
  });

  it("ignores malformed local data", () => {
    localStorage.setItem(messagesKey("user-a"), "not-json");
    expect(readMessageThreads("user-a")).toEqual([]);
  });
});
