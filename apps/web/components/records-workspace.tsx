"use client";

import { CalendarDays, Check, Circle, Euro, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { kindOptions, type LifeRecord, moduleLabels, useLifeRecords } from "@/lib/jarins-store";

type Draft = { kind: string; title: string; detail: string; date: string; status: LifeRecord["status"]; amount: string; progress: string; essential: boolean };
const blank = (kind: string): Draft => ({ kind, title: "", detail: "", date: "", status: "open", amount: "", progress: "", essential: false });

const subsectionKinds: Partial<Record<LifeRecord["module"], Record<string, string[]>>> = {
  family: { calendar: ["Event"], routines: ["Routine"], clothing: ["Clothing"], documents: ["Child note"], memories: ["Memory"] },
  home: { meals: ["Meal"], groceries: ["Grocery"], routines: ["Routine"], maintenance: ["Maintenance", "Contract"] },
  self: { "check-in": ["Check-in"], routines: ["Routine"], "protected-time": ["Protected time"] },
  learning: { programs: ["Program"], sessions: ["Study session"], evidence: ["Certificate", "Evidence"] },
  career: { transition: ["Transition"], timeline: ["Timeline"], evidence: ["Evidence"], portfolio: ["Portfolio"], "job-readiness": ["Job readiness"] },
  money: { recurring: ["Monthly cost", "Annual cost", "Subscription"], goals: ["Savings goal"] },
  future: { goals: ["This month", "3 months", "12 months", "3 years", "Someday"], projects: ["Project"] },
};

export function recordsInSection(records: LifeRecord[], module: LifeRecord["module"], subsection?: string, today = new Date().toISOString().slice(0, 10)) {
  const allowedKinds = subsection ? subsectionKinds[module]?.[subsection] : undefined;
  return records.filter((record) => record.module === module)
    .filter((record) => !allowedKinds || allowedKinds.includes(record.kind))
    .filter((record) => subsection !== "upcoming" && subsection !== "expiring" || Boolean(record.date && record.date >= today && record.status !== "done"));
}

export function RecordsWorkspace({ module, subsection }: { module: LifeRecord["module"]; subsection?: string }) {
  const { records, add, update, remove } = useLifeRecords();
  const today = new Date().toISOString().slice(0, 10);
  const allowedKinds = subsection ? subsectionKinds[module]?.[subsection] : undefined;
  const defaultKind = allowedKinds?.[0] ?? kindOptions[module][0];
  const workspaceLabel = subsection ? subsection.replaceAll("-", " ") : moduleLabels[module];
  const [query, setQuery] = useState(""); const [statusFilter, setStatusFilter] = useState<"all" | LifeRecord["status"]>("all");
  const items = useMemo(() => recordsInSection(records, module, subsection, today)
    .filter((record) => statusFilter === "all" || record.status === statusFilter)
    .filter((record) => !query.trim() || `${record.title} ${record.detail} ${record.kind}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")), [records, module, subsection, today, statusFilter, query]);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<string>(); const [draft, setDraft] = useState<Draft>(() => blank(defaultKind));
  const counts = useMemo(() => ({ total: items.length, done: items.filter((item) => item.status === "done").length, upcoming: items.filter((item) => item.date && item.date >= new Date().toISOString().slice(0,10) && item.status !== "done").length }), [items]);
  const begin = (record?: LifeRecord) => { setEditing(record?.id); setDraft(record ? { kind: record.kind, title: record.title, detail: record.detail, date: record.date ?? "", status: record.status, amount: record.amount?.toString() ?? "", progress: record.progress?.toString() ?? "", essential: record.essential ?? false } : blank(defaultKind)); setOpen(true); };
  const save = (event: React.FormEvent) => { event.preventDefault(); if (!draft.title.trim()) return; const values = { module, kind: draft.kind, title: draft.title.trim(), detail: draft.detail.trim(), date: draft.date || undefined, status: draft.status, amount: draft.amount ? Number(draft.amount) : undefined, progress: draft.progress ? Math.max(0, Math.min(100, Number(draft.progress))) : undefined, essential: draft.essential }; if (editing) update(editing, values); else add(values); setOpen(false); };
  const formatDate = (date?: string) => date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`)) : "No date";

  return <section className="records-section">
    <div className="records-heading"><div><span className="kicker">Your information</span><h2>{workspaceLabel[0]?.toUpperCase()}{workspaceLabel.slice(1)} workspace</h2><p>{counts.total} shown · {counts.done} completed · {counts.upcoming} upcoming</p></div><button className="button primary" onClick={() => begin()}><Plus size={16}/> Add {defaultKind.toLowerCase()}</button></div>
    <div className="record-filters"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter this workspace…" aria-label="Filter workspace" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter by status"><option value="all">All statuses</option><option value="open">Open</option><option value="in-progress">In progress</option><option value="done">Done</option><option value="paused">Paused</option></select></div>
    <div className="records-list">{items.length ? items.map((record) => <article className={`record-row ${record.status === "done" ? "complete" : ""}`} key={record.id}>
      <button className="record-check" onClick={() => update(record.id, { status: record.status === "done" ? "open" : "done", progress: record.status === "done" ? record.progress : 100 })} aria-label={`${record.status === "done" ? "Reopen" : "Complete"} ${record.title}`}>{record.status === "done" ? <Check size={15}/> : <Circle size={15}/>}</button>
      <div className="record-copy"><div><span className={`record-kind ${module}`}>{record.kind}</span>{record.essential && <span className="record-kind essential">Today essential</span>}</div><h3>{record.title}</h3><p>{record.detail || "No extra details yet."}</p><div className="record-meta"><span><CalendarDays size={13}/>{formatDate(record.date)}</span>{typeof record.amount === "number" && <span><Euro size={13}/>{record.amount.toFixed(2)}</span>}<span className={`record-status ${record.status}`}>{record.status.replace("-", " ")}</span></div>{typeof record.progress === "number" && <div className="record-progress"><span style={{ width: `${record.progress}%` }}/><small>{record.progress}%</small></div>}</div>
      <div className="record-actions"><button className="icon-button" onClick={() => begin(record)} aria-label={`Edit ${record.title}`}><Pencil size={16}/></button><button className="icon-button danger-icon" onClick={() => { if (window.confirm(`Delete “${record.title}”?`)) remove(record.id); }} aria-label={`Delete ${record.title}`}><Trash2 size={16}/></button></div>
    </article>) : <div className="records-empty"><h3>{query || statusFilter !== "all" ? "No matching items" : "Nothing here yet"}</h3><p>{query || statusFilter !== "all" ? "Try a different search or status." : "Add only information that helps future you remember, decide or find something."}</p>{query || statusFilter !== "all" ? <button className="button secondary" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Clear filters</button> : <button className="button secondary" onClick={() => begin()}>Add the first item</button>}</div>}</div>

    {open && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}><form className="modal-card record-form" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="record-form-title"><div className="modal-heading"><div><span className="eyebrow">{moduleLabels[module]}</span><h2 id="record-form-title">{editing ? "Edit item" : "Add something useful"}</h2></div><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={19}/></button></div>
      <div className="form-grid"><label className="input-row">Type<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>{(allowedKinds ?? kindOptions[module]).map((kind) => <option key={kind}>{kind}</option>)}</select></label><label className="input-row">Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as LifeRecord["status"] })}><option value="open">Open</option><option value="in-progress">In progress</option><option value="done">Done</option><option value="paused">Paused</option></select></label></div>
      <label className="input-row">Title<input autoFocus required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={`e.g. ${defaultKind}`} /></label><label className="input-row">Useful details<textarea value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="What will you need to know later?" /></label>
      <div className="form-grid"><label className="input-row">Date or deadline<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })}/></label>{module === "money" ? <label className="input-row">Amount (€)<input type="number" min="0" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })}/></label> : <label className="input-row">Progress (%)<input type="number" min="0" max="100" value={draft.progress} onChange={(e) => setDraft({ ...draft, progress: e.target.value })}/></label>}</div>
      <label className="toggle-row compact"><span><strong>Show as a Today essential</strong><small>Use this only for the few things that matter now.</small></span><input type="checkbox" checked={draft.essential} onChange={(e) => setDraft({ ...draft, essential: e.target.checked })}/></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" type="submit">{editing ? "Save changes" : "Add item"}</button></div>
    </form></div>}
  </section>;
}
