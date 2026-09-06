"use client";

import { Bell, Check, FileText, ListTodo, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { capturedItemSchema, type CapturedItem } from "@/lib/records/schema";
import { type LifeRecord, useLifeRecords } from "@/lib/jarins-store";
import { usePreferences } from "@/lib/preferences-store";

/**
 * Where a capture can land, per workspace. Offering "Family" while somebody is
 * working — or "Pipeline" while they are planning the week — is how a capture
 * box turns into a filing decision.
 */
const workspaceCategories: Record<string, string[]> = {
  personal: [
    "Inbox",
    "Family",
    "Home",
    "Self",
    "Learning",
    "Career",
    "Money",
    "Documents",
    "Future",
  ],
  professional: [
    "Inbox",
    "Work",
    "Pipeline",
    "Portfolio",
    "Network",
    "Career",
    "Learning",
    "Documents",
  ],
};
const INBOX_KEY = "jarins-inbox";
type CaptureType = "task" | "note" | "reminder";

const captureTypes: Array<{
  key: CaptureType;
  label: string;
  description: string;
  icon: typeof ListTodo;
}> = [
  {
    key: "task",
    label: "Task",
    description: "Something to do",
    icon: ListTodo,
  },
  {
    key: "note",
    label: "Note",
    description: "Something to keep",
    icon: FileText,
  },
  {
    key: "reminder",
    label: "Reminder",
    description: "Add it to Calendar",
    icon: Bell,
  },
];

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  const { preferences } = usePreferences();
  const categories =
    workspaceCategories[preferences.workspace] ?? workspaceCategories.personal;
  const [text, setText] = useState("");
  const [chosenCategory, setCategory] = useState("Inbox");
  // Derived rather than corrected in an effect: switching workspace mid-session
  // leaves a choice selected that the new workspace does not offer, and a
  // capture would then file itself somewhere the person cannot see.
  const category = categories.includes(chosenCategory)
    ? chosenCategory
    : "Inbox";
  const [captureType, setCaptureType] = useState<CaptureType>("task");
  const [reminderDate, setReminderDate] = useState(() => localDateKey());
  const [reminderTime, setReminderTime] = useState("");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
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
    if (category === "Inbox" && captureType !== "reminder") {
      const item: CapturedItem = {
        id: crypto.randomUUID(),
        text: text.trim(),
        category,
        kind: captureType === "note" ? "Note" : "Task",
        createdAt: new Date().toISOString(),
        status: "inbox",
      };
      writeInbox([item, ...readInbox()]);
    } else {
      void add({
        module: category.toLowerCase() as LifeRecord["module"],
        kind:
          captureType === "reminder"
            ? "Reminder"
            : captureType === "note"
              ? "Note"
              : "Task",
        title: text.trim(),
        detail:
          captureType === "reminder"
            ? reminderTime
              ? `Reminder at ${reminderTime}. Captured quickly.`
              : "Reminder captured quickly."
            : captureType === "note"
              ? "Quick note. Add details when useful."
              : "Captured quickly. Add details when useful.",
        ...(captureType === "reminder" ? { date: reminderDate } : {}),
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
            {captureType === "note"
              ? "What do you want to note?"
              : captureType === "reminder"
                ? "What should we remind you about?"
                : "What do you want to remember?"}
          </label>
          <textarea
            ref={input}
            id="capture-text"
            className="capture-input capture-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              captureType === "note"
                ? "Write a thought, detail or idea…"
                : captureType === "reminder"
                  ? "Renew the insurance…"
                  : "Buy rain trousers next week…"
            }
          />
          <fieldset>
            <legend>Capture as</legend>
            <div className="capture-type-grid">
              {captureTypes.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.key}
                    className={captureType === item.key ? "selected" : ""}
                    onClick={() => {
                      setCaptureType(item.key);
                      if (item.key === "reminder" && category === "Inbox")
                        setCategory("Family");
                    }}
                  >
                    <Icon size={17} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {captureType === "reminder" && (
            <div className="reminder-fields">
              <label>
                Date
                <input
                  type="date"
                  required
                  min={localDateKey()}
                  value={reminderDate}
                  onChange={(event) => setReminderDate(event.target.value)}
                />
              </label>
              <label>
                Time <small>Optional</small>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(event) => setReminderTime(event.target.value)}
                />
              </label>
            </div>
          )}
          <fieldset>
            <legend>Where does it belong?</legend>
            <div className="chips">
              {categories
                .filter(
                  (item) => captureType !== "reminder" || item !== "Inbox",
                )
                .map((item) => (
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
              {captureType === "reminder"
                ? `Save a reminder in ${category} and show it on Calendar.`
                : category === "Inbox"
                  ? "Keep it in Inbox until you choose where it belongs."
                  : `Save this ${captureType} directly to ${category}.`}
            </p>
            <button className="button primary" type="submit">
              {saved ? (
                <>
                  <Check size={17} /> Saved
                </>
              ) : (
                `Save ${captureType}`
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
