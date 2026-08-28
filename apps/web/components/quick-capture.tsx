"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type LifeRecord, useLifeRecords } from "@/lib/jarins-store";

const categories = ["Inbox", "Family", "Home", "Self", "Learning", "Career", "Money", "Documents", "Future"];
export type CapturedItem = { id: string; text: string; category: string; createdAt: string; status: "inbox" | "processed" };

export function readInbox(): CapturedItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("jarins-inbox") ?? "[]") as CapturedItem[]; } catch { return []; }
}

export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("Inbox");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { add } = useLifeRecords();
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60); }, [open]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return input.current?.focus();
    if (category === "Inbox") {
      const item: CapturedItem = { id: crypto.randomUUID(), text: text.trim(), category, createdAt: new Date().toISOString(), status: "inbox" };
      localStorage.setItem("jarins-inbox", JSON.stringify([item, ...readInbox()]));
      window.dispatchEvent(new Event("jarins-inbox-changed"));
    } else {
      add({ module: category.toLowerCase() as LifeRecord["module"], kind: "Task", title: text.trim(), detail: "Captured quickly. Add details when useful.", status: "open" });
    }
    setText(""); setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 700);
  };
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="capture-title">
      <div className="modal-heading"><div><span className="eyebrow">Get it out of your head</span><h2 id="capture-title">Capture anything</h2></div><button className="icon-button" onClick={onClose} aria-label="Close capture"><X size={19} /></button></div>
      <form onSubmit={save}>
        <label className="field-label" htmlFor="capture-text">What do you want to remember?</label>
        <input ref={input} id="capture-text" className="capture-input" value={text} onChange={(event) => setText(event.target.value)} placeholder="Buy rain trousers next week…" />
        <fieldset><legend>Where does it belong?</legend><div className="chips">{categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={category === item ? "selected" : ""}>{item}</button>)}</div></fieldset>
        <div className="form-row"><p>{category === "Inbox" ? "Keep it in Inbox until you choose where it belongs." : `Save it directly to ${category}.`}</p><button className="button primary" type="submit">{saved ? <><Check size={17} /> Saved</> : `Save to ${category}`}</button></div>
      </form>
    </section>
  </div>;
}
