"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { capturedItemSchema, type CapturedItem } from "@/lib/records/schema";
import { type LifeRecord, useLifeRecords } from "@/lib/jarins-store";

const categories = [
  "Inbox",
  "Family",
  "Home",
  "Self",
  "Learning",
  "Career",
  "Money",
  "Documents",
  "Future",
];
const INBOX_KEY = "jarins-inbox";

export type { CapturedItem };

export function readInbox(): CapturedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = capturedItemSchema
      .array()
      .safeParse(JSON.parse(localStorage.getItem(INBOX_KEY) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeInbox(items: CapturedItem[]) {
  localStorage.setItem(INBOX_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("jarins-inbox-changed"));
}

export function QuickCapture({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("Inbox");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const { add } = useLifeRecords();

  // showModal() traps focus, makes the rest of the page inert and handles
  // Escape, none of which the previous hand-rolled overlay did.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      input.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // `cancel` and `close` do not bubble, so React's onCancel/onClose props never
  // fire for them. Listening on the element itself is what actually works, and
  // it keeps React state in step however the dialog was dismissed.
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

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return input.current?.focus();
    if (category === "Inbox") {
      const item: CapturedItem = {
        id: crypto.randomUUID(),
        text: text.trim(),
        category,
        createdAt: new Date().toISOString(),
        status: "inbox",
      };
      writeInbox([item, ...readInbox()]);
    } else {
      void add({
        module: category.toLowerCase() as LifeRecord["module"],
        kind: "Task",
        title: text.trim(),
        detail: "Captured quickly. Add details when useful.",
        status: "open",
      });
    }
    setText("");
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  return (
    <dialog
      ref={dialog}
      className="modal-dialog"
      aria-labelledby="capture-title"
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Get it out of your head</span>
            <h2 id="capture-title">Capture anything</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close capture"
          >
            <X size={19} />
          </button>
        </div>
        <form onSubmit={save}>
          <label className="field-label" htmlFor="capture-text">
            What do you want to remember?
          </label>
          <input
            ref={input}
            id="capture-text"
            className="capture-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buy rain trousers next week…"
          />
          <fieldset>
            <legend>Where does it belong?</legend>
            <div className="chips">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setCategory(item)}
                  className={category === item ? "selected" : ""}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <p>
              {category === "Inbox"
                ? "Keep it in Inbox until you choose where it belongs."
                : `Save it directly to ${category}.`}
            </p>
            <button className="button primary" type="submit">
              {saved ? (
                <>
                  <Check size={17} /> Saved
                </>
              ) : (
                `Save to ${category}`
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
