import { beforeEach, describe, expect, it } from "vitest";
import {
  appendThreadMessage,
  createMessagePerson,
  createMessageTeam,
  createMessageThread,
  messagePeopleKey,
  messageTeamsKey,
  messagesKey,
  readMessagePeople,
  readMessageTeams,
  readMessageThreads,
  removeMessagePerson,
  updateMessageTeam,
} from "./messages";

describe("message thread persistence", () => {
  beforeEach(() => localStorage.clear());

  it("keeps threads scoped to the current account", () => {
    createMessageThread("user-a", { title: "Family", kind: "team" });
    createMessagePerson("user-a", { name: "Alex", detail: "" });
    createMessageTeam("user-a", { name: "Household", memberIds: [] });

    expect(readMessageThreads("user-a")).toHaveLength(1);
    expect(readMessageThreads("user-b")).toEqual([]);
    expect(readMessagePeople("user-b")).toEqual([]);
    expect(readMessageTeams("user-b")).toEqual([]);
    expect(messagesKey("user-a")).not.toBe(messagesKey("user-b"));
    expect(messagePeopleKey("user-a")).not.toBe(messagePeopleKey("user-b"));
    expect(messageTeamsKey("user-a")).not.toBe(messageTeamsKey("user-b"));
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

  it("adds individual people and whole teams to a thread", () => {
    const alex = createMessagePerson("user-a", {
      name: "Alex",
      detail: "alex@example.com",
    });
    const sam = createMessagePerson("user-a", {
      name: "Sam",
      detail: "",
    });
    const household = createMessageTeam("user-a", {
      name: "Household",
      memberIds: [alex.id, sam.id],
    });

    createMessageThread("user-a", {
      title: "Weekend plans",
      kind: "team",
      participantIds: [alex.id],
      teamIds: [household.id],
    });

    expect(readMessageThreads("user-a")[0]).toMatchObject({
      participantIds: [alex.id],
      teamIds: [household.id],
    });
  });

  it("edits teams and cleans up membership when a person is removed", () => {
    const person = createMessagePerson("user-a", {
      name: "Alex",
      detail: "",
    });
    const team = createMessageTeam("user-a", {
      name: "Family",
      memberIds: [],
    });

    updateMessageTeam("user-a", team.id, {
      name: "Home team",
      memberIds: [person.id],
    });
    expect(readMessageTeams("user-a")[0]).toMatchObject({
      name: "Home team",
      memberIds: [person.id],
    });

    removeMessagePerson("user-a", person.id);
    expect(readMessagePeople("user-a")).toEqual([]);
    expect(readMessageTeams("user-a")[0]?.memberIds).toEqual([]);
  });
});
