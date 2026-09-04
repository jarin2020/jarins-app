"use client";

import {
  ArrowUp,
  MessageCircle,
  MessagesSquare,
  Plus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { type ConversationKind, useMessageThreads } from "@/lib/messages";

type ThreadFilter = "all" | ConversationKind;

export function MessageCenter({
  open,
  onClose,
  ownerId,
  author,
}: {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  author: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const messageInput = useRef<HTMLInputElement>(null);
  const { threads, create, send } = useMessageThreads(ownerId);
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<ConversationKind>("person");
  const [text, setText] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const handleClose = () => close.current();
    element.addEventListener("close", handleClose);
    return () => element.removeEventListener("close", handleClose);
  }, []);

  const visibleThreads = useMemo(
    () =>
      filter === "all"
        ? threads
        : threads.filter((thread) => thread.kind === filter),
    [filter, threads],
  );
  const activeThread =
    visibleThreads.find((thread) => thread.id === selectedId) ??
    visibleThreads[0];

  const createThread = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    const thread = create({ title: newTitle, kind: newKind });
    setFilter("all");
    setSelectedId(thread.id);
    setNewTitle("");
    setComposing(false);
    queueMicrotask(() => messageInput.current?.focus());
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeThread || !text.trim()) return;
    send(activeThread.id, { text, author });
    setText("");
    messageInput.current?.focus();
  };

  return (
    <dialog
      ref={dialog}
      className="modal-dialog message-dialog"
      aria-labelledby="messages-title"
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="message-center">
        <header className="message-center-header">
          <div>
            <span className="eyebrow">People, teams and threads</span>
            <h2 id="messages-title">Messages</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close messages"
          >
            <X size={19} />
          </button>
        </header>

        <div className="message-center-body">
          <aside className="thread-sidebar">
            <div className="thread-filters" aria-label="Message filters">
              <button
                type="button"
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                <MessagesSquare size={15} /> Threads
              </button>
              <button
                type="button"
                className={filter === "person" ? "active" : ""}
                onClick={() => setFilter("person")}
              >
                <UserRound size={15} /> People
              </button>
              <button
                type="button"
                className={filter === "team" ? "active" : ""}
                onClick={() => setFilter("team")}
              >
                <UsersRound size={15} /> Teams
              </button>
            </div>

            <button
              type="button"
              className="new-thread-button"
              onClick={() => setComposing((current) => !current)}
              aria-expanded={composing}
            >
              <Plus size={15} /> New thread
            </button>

            {composing && (
              <form className="new-thread-form" onSubmit={createThread}>
                <label>
                  Message a
                  <select
                    value={newKind}
                    onChange={(event) =>
                      setNewKind(event.target.value as ConversationKind)
                    }
                  >
                    <option value="person">Person</option>
                    <option value="team">Team</option>
                  </select>
                </label>
                <label>
                  Name
                  <input
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder={newKind === "team" ? "Family team" : "Name"}
                    maxLength={100}
                    required
                  />
                </label>
                <button className="button primary small" type="submit">
                  Create thread
                </button>
              </form>
            )}

            <div className="thread-list">
              {visibleThreads.map((thread) => {
                const Icon = thread.kind === "team" ? UsersRound : UserRound;
                const last = thread.messages.at(-1);
                return (
                  <button
                    type="button"
                    key={thread.id}
                    className={activeThread?.id === thread.id ? "active" : ""}
                    onClick={() => setSelectedId(thread.id)}
                  >
                    <span>
                      <Icon size={16} />
                    </span>
                    <div>
                      <strong>{thread.title}</strong>
                      <small>{last?.text ?? "New conversation"}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="thread-view">
            {activeThread ? (
              <>
                <header>
                  <div>
                    <span className="kicker">
                      {activeThread.kind === "team" ? "Team" : "Person"}
                    </span>
                    <h3>{activeThread.title}</h3>
                  </div>
                  <small>Private Jarins thread</small>
                </header>
                <div className="thread-messages" aria-live="polite">
                  {activeThread.messages.length ? (
                    activeThread.messages.map((message) => (
                      <article key={message.id}>
                        <div>{message.text}</div>
                        <small>
                          {message.author} ·{" "}
                          {new Intl.DateTimeFormat("en", {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(message.createdAt))}
                        </small>
                      </article>
                    ))
                  ) : (
                    <div className="thread-empty">
                      <MessageCircle size={24} />
                      <strong>Start the conversation</strong>
                      <p>Messages in this thread stay in this browser.</p>
                    </div>
                  )}
                </div>
                <form className="message-compose" onSubmit={sendMessage}>
                  <input
                    ref={messageInput}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={`Message ${activeThread.title}`}
                    maxLength={4000}
                    aria-label={`Message ${activeThread.title}`}
                  />
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!text.trim()}
                    aria-label="Send message"
                  >
                    <ArrowUp size={17} />
                  </button>
                </form>
              </>
            ) : (
              <div className="message-empty">
                <MessagesSquare size={28} />
                <h3>No threads yet</h3>
                <p>Create a conversation with a person or team.</p>
                <button
                  className="button primary small"
                  type="button"
                  onClick={() => setComposing(true)}
                >
                  <Plus size={15} /> New thread
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </dialog>
  );
}
