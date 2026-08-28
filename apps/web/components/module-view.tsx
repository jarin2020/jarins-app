"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Download, FileUp, Plus, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { findModule } from "@/lib/modules";
import { moduleData } from "@/lib/sample-data";
import { type CapturedItem, readInbox } from "./quick-capture";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { moduleLabels, readLifeRecords, replaceLifeRecords, type LifeRecord, useLifeRecords } from "@/lib/jarins-store";
import { RecordsWorkspace } from "./records-workspace";
import { PREFERENCES_KEY, usePreferences } from "@/lib/preferences-store";

export function ModuleView({ slug }: { slug: string[] }) {
  const root = slug[0] ?? "today";
  if (root === "login") return <LoginView />;
  if (root === "onboarding") return <Onboarding />;
  if (root === "reset") return <WeeklyReset />;
  if (root === "inbox") return <InboxView />;
  if (root === "search") return <SearchView />;
  if (root === "calendar") return <CalendarView />;
  if (root === "settings") return <SettingsView section={slug[1]} />;
  return <LifeModule root={root} subsection={slug[1]} />;
}

function PageIntro({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action?: string; onAction?: () => void }) {
  return <header className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <button className="button dark" onClick={onAction}><Plus size={17} /> {action}</button>}</header>;
}

function LifeModule({ root, subsection }: { root: string; subsection?: string }) {
  const currentModule = findModule(root);
  const data = moduleData[root as keyof typeof moduleData];
  const { records } = useLifeRecords();
  if (!data) return <Empty title={currentModule.label} />;
  const moduleRecords = records.filter((record) => record.module === root);
  const openCount = moduleRecords.filter((record) => record.status !== "done").length;
  const doneCount = moduleRecords.filter((record) => record.status === "done").length;
  const upcomingCount = moduleRecords.filter((record) => record.date && record.date >= new Date().toISOString().slice(0,10) && record.status !== "done").length;
  const subnav: Record<string, string[]> = {
    family: ["Overview", "Calendar", "Routines", "Clothing", "Documents", "Memories"],
    home: ["Overview", "Meals", "Groceries", "Routines", "Maintenance"],
    self: ["Overview", "Check-in", "Routines", "Protected time"],
    learning: ["Overview", "Programs", "Sessions", "Evidence"],
    career: ["Overview", "Transition", "Timeline", "Evidence", "Portfolio", "Job readiness"],
    money: ["Overview", "Recurring", "Upcoming", "Goals"],
    documents: ["Overview", "Expiring", "Categories"],
    future: ["Overview", "Goals", "Projects"],
  };
  return <>
    <PageIntro eyebrow={currentModule.eyebrow} title={subsection ? subsection.replaceAll("-", " ") : currentModule.label} description={currentModule.description} />
    <nav className="subnav" aria-label={`${currentModule.label} sections`}>{subnav[root]?.map((item) => { const part = item.toLowerCase().replaceAll(" ", "-"); const href = part === "overview" ? `/${root}` : `/${root}/${part}`; return <Link key={item} href={href} className={(subsection ?? "overview") === part ? "active" : ""}>{item}</Link>; })}</nav>
    <div className="stat-grid"><div className="stat-card"><strong>{moduleRecords.length}</strong><span>Total items</span></div><div className="stat-card"><strong>{openCount}</strong><span>Need attention</span></div><div className="stat-card"><strong>{upcomingCount}</strong><span>Upcoming · {doneCount} done</span></div></div>
    {root === "self" && <CheckinPanel />}
    {root === "career" && <CareerTrail />}
    {root === "documents" && <PrivacyNotice />}
    <RecordsWorkspace module={root as "family" | "home" | "self" | "learning" | "career" | "money" | "documents" | "future"} subsection={subsection} />
  </>;
}

function CheckinPanel() {
  const [energy, setEnergy] = useState(3);
  const key = `jarins-energy-${new Date().toISOString().slice(0,10)}`;
  useEffect(() => { queueMicrotask(() => { const saved = Number(localStorage.getItem(key)); if (saved >= 1 && saved <= 5) setEnergy(saved); }); }, [key]);
  const chooseEnergy = (value: number) => { setEnergy(value); localStorage.setItem(key, String(value)); };
  return <section className="checkin-panel"><div><span className="kicker">Today’s check-in</span><h2>How are you arriving today?</h2><p>Saved for today on this device. It only changes which routine version we suggest.</p></div><div className="energy-scale" role="group" aria-label="Energy level">{[1,2,3,4,5].map((value) => <button key={value} className={energy === value ? "active" : ""} onClick={() => chooseEnergy(value)}><strong>{value}</strong><span>{["Very low", "Low", "Okay", "Good", "Full"][value - 1]}</span></button>)}</div><div className="soft-notice"><span>{energy <= 2 ? "Minimum morning: water, get dressed, 3-minute plan." : "Ideal morning: 30 minutes with a gentle plan."}</span></div></section>;
}

function CareerTrail() { return <section className="career-trail"><span className="kicker">My transition</span><h2>A coherent progression, backed by evidence</h2><div>{["Caregiving period", "German B1", "B2 Beruf", "Digital Marketing", "Portfolio", "Return to work"].map((item, index) => <div className={index < 2 ? "complete" : index === 2 ? "active" : ""} key={item}><span>{index < 2 ? <Check size={13} /> : index + 1}</span><strong>{item}</strong><small>{index === 2 ? "Current focus" : index < 2 ? "Evidence saved" : "Next"}</small></div>)}</div></section>; }
function PrivacyNotice() { return <aside className="privacy-notice"><ShieldCheck size={22} /><div><strong>Private by default</strong><p>This device keeps the document index locally. Sensitive files are never sent to AI without explicit opt-in.</p></div><Link href="/settings/privacy" className="text-button">Privacy settings <ChevronRight size={15} /></Link></aside>; }

function InboxView() {
  const [items, setItems] = useState<CapturedItem[]>([]);
  const [destinations, setDestinations] = useState<Record<string, LifeRecord["module"] | "">>({});
  const { add } = useLifeRecords();
  useEffect(() => { const load = () => setItems(readInbox()); load(); window.addEventListener("jarins-inbox-changed", load); return () => window.removeEventListener("jarins-inbox-changed", load); }, []);
  const remove = (id: string) => { const next = items.filter((item) => item.id !== id); setItems(next); localStorage.setItem("jarins-inbox", JSON.stringify(next)); };
  const process = (item: CapturedItem) => { const destination = destinations[item.id]; if (!destination) return; add({ module: destination, kind: "Task", title: item.text, detail: `Captured ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.createdAt))}`, status: "open" }); remove(item.id); };
  return <><PageIntro eyebrow="Captured, not forgotten" title="Inbox" description="Choose a life area once, then the item becomes part of that workspace." />{items.length ? <section className="list-surface">{items.map((item) => <article className="inbox-row" key={item.id}><span className="feature-icon green"><Check size={17} /></span><div><strong>{item.text}</strong><p>{item.category} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p></div><div><select aria-label={`Life area for ${item.text}`} value={destinations[item.id] ?? ""} onChange={(event) => setDestinations((current) => ({ ...current, [item.id]: event.target.value as LifeRecord["module"] }))}><option value="">Choose area</option>{Object.entries(moduleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button secondary small" disabled={!destinations[item.id]} onClick={() => process(item)}>Process</button><button className="icon-button" onClick={() => remove(item.id)} aria-label={`Remove ${item.text}`}><Trash2 size={17} /></button></div></article>)}</section> : <Empty title="Your inbox is clear" body="Nothing urgent here. That is allowed. Use Quick capture whenever something enters your head." />}</>;
}

function SearchView() { const searchParams = useSearchParams(); const [query, setQuery] = useState(() => searchParams.get("q") ?? ""); const { records } = useLifeRecords(); const matches = useMemo(() => query ? records.filter((record) => `${record.title} ${record.detail} ${record.kind} ${record.module}`.toLowerCase().includes(query.toLowerCase())) : [], [query, records]); return <><PageIntro eyebrow="Find, don’t remember" title="Search" description="Search across family, documents, learning, money and goals." /><div className="large-search"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘certificate’ or ‘Kita’…" aria-label="Search all Jarins data" /></div>{query && <section className="list-surface"><span className="kicker">{matches.length} results</span>{matches.length ? matches.map((item) => <Link href={`/${item.module}`} className="search-result" key={item.id}><div><strong>{item.title}</strong><p>{item.kind} · {item.module}</p></div><span>Open <ArrowRight size={14} /></span></Link>) : <p className="muted search-empty">No saved item matches “{query}”.</p>}</section>}</>; }

function CalendarView() {
  const { records } = useLifeRecords();
  const localKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const days = Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; });
  const today = localKey(days[0]); const end = localKey(days[days.length - 1]);
  const upcoming = records.filter((record) => record.date && record.date >= today && record.date <= end && record.status !== "done").sort((a,b) => a.date!.localeCompare(b.date!));
  return <><PageIntro eyebrow="The shape of your week" title="Calendar" description="Family events, appointments, deadlines and protected time in one place." /><div className="calendar-grid">{days.map((date, index) => { const key = localKey(date); const matches = records.filter((record) => record.date === key && record.status !== "done"); return <div className={index === 0 ? "today" : ""} key={key}><span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong>{matches.slice(0,2).map((item) => <Link href={`/${item.module}`} key={item.id}><small>{item.title}</small></Link>)}</div>; })}</div><section className="list-surface"><h2>Next 14 days</h2>{upcoming.length ? upcoming.map((item) => <Link href={`/${item.module}`} className="search-result" key={item.id}><div><strong>{item.title}</strong><p>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${item.date}T12:00:00`))} · {item.kind}</p></div><ChevronRight size={16} /></Link>) : <p className="muted">Nothing dated in the next 14 days.</p>}</section></>;
}

function WeeklyReset() {
  const steps = ["Empty Inbox", "Review last week", "Family calendar", "Admin and deadlines", "Meals and groceries", "Home routines", "Three weekly outcomes", "Protect learning blocks", "Protected personal time", "Check next 14 days", "Finish gently"];
  const [current, setCurrent] = useState(0); const [complete, setComplete] = useState<number[]>([]); const [notes, setNotes] = useState<Record<number, string>>({}); const [saved, setSaved] = useState(false);
  useEffect(() => { queueMicrotask(() => { try { const value = JSON.parse(localStorage.getItem("jarins-weekly-reset-v1") ?? "{}"); setCurrent(value.current ?? 0); setComplete(value.complete ?? []); setNotes(value.notes ?? {}); } catch { /* keep a clean reset */ } }); }, []);
  const persist = (nextComplete = complete, nextNotes = notes, nextCurrent = current) => { localStorage.setItem("jarins-weekly-reset-v1", JSON.stringify({ current: nextCurrent, complete: nextComplete, notes: nextNotes, updatedAt: new Date().toISOString() })); setSaved(true); window.setTimeout(() => setSaved(false), 1600); };
  const quickReset = () => { const quick = [0, 2, 3, 6, 9]; setComplete(quick); setCurrent(0); persist(quick, notes, 0); };
  const finishStep = () => { const nextComplete = [...new Set([...complete, current])]; const nextCurrent = Math.min(steps.length - 1, current + 1); setComplete(nextComplete); setCurrent(nextCurrent); persist(nextComplete, notes, nextCurrent); };
  return <><PageIntro eyebrow="25–35 quiet minutes" title="Weekly reset" description="A guided review that saves your place and notes on this device." action="Quick 5-minute reset" onAction={quickReset} /><div className="reset-layout"><ol className="reset-steps">{steps.map((step, index) => <li key={step} className={complete.includes(index) ? "complete" : current === index ? "active" : ""}><button onClick={() => setCurrent(index)}><span>{complete.includes(index) ? <Check size={13} /> : index + 1}</span>{step}</button></li>)}</ol><section className="reset-workspace"><span className="kicker">Step {current + 1} of {steps.length}</span><h2>{steps[current]}</h2><p>{current === 0 ? "Look at each capture once. Turn it into an action, keep it as a note, or let it go." : "Notice what matters without judging last week. A minimum plan is still a plan."}</p><textarea aria-label="Weekly reset notes" placeholder="A few useful notes…" value={notes[current] ?? ""} onChange={(event) => { const next = { ...notes, [current]: event.target.value }; setNotes(next); persist(complete, next, current); }} /><div className="reset-actions"><button className="button secondary" disabled={current === 0} onClick={() => setCurrent((x) => x - 1)}>Back</button><span className="save-state" role="status">{saved ? "Saved" : `${complete.length}/${steps.length} complete`}</span><button className="button primary" onClick={finishStep}>{current === steps.length - 1 ? "Finish reset" : "Complete and continue"}</button></div></section></div></>;
}

function SettingsView({ section }: { section?: string }) {
  const router = useRouter();
  const links = ["Profile", "Household", "Notifications", "Privacy", "Data"];
  const active = section ?? "profile";
  const { preferences, save: savePreferences } = usePreferences();
  const [draft, setDraft] = useState(preferences);
  const [saved, setSaved] = useState(false);
  const [dataMessage, setDataMessage] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => { queueMicrotask(() => setDraft(preferences)); }, [preferences]);
  const save = (next = draft) => { savePreferences(next); setSaved(true); window.setTimeout(() => setSaved(false), 1600); };
  const patchPreference = <K extends keyof typeof draft,>(key: K, value: (typeof draft)[K]) => { const next = { ...draft, [key]: value }; setDraft(next); if (typeof value === "boolean") save(next); };
  const exportData = () => { const payload = { exportedAt: new Date().toISOString(), lifeRecords: readLifeRecords(), inbox: readInbox(), preferences: draft, weeklyReset: JSON.parse(localStorage.getItem("jarins-weekly-reset-v1") ?? "null") }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `jarins-export-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url); };
  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; try { const payload = JSON.parse(await file.text()); if (!Array.isArray(payload.lifeRecords)) throw new Error("No life records were found in this file."); if (!window.confirm("Replace this device’s Jarins data with this backup?")) return; replaceLifeRecords(payload.lifeRecords); if (Array.isArray(payload.inbox)) { localStorage.setItem("jarins-inbox", JSON.stringify(payload.inbox)); window.dispatchEvent(new Event("jarins-inbox-changed")); } if (payload.preferences) localStorage.setItem(PREFERENCES_KEY, JSON.stringify(payload.preferences)); if (payload.weeklyReset) localStorage.setItem("jarins-weekly-reset-v1", JSON.stringify(payload.weeklyReset)); setDataMessage(`Imported ${payload.lifeRecords.length} records from ${file.name}.`); window.dispatchEvent(new Event("jarins-preferences-changed")); } catch (error) { setDataMessage(error instanceof Error ? error.message : "This backup could not be imported."); } finally { event.target.value = ""; } };
  const resetData = () => { if (!window.confirm("Reset Jarins on this device? This removes your records, inbox, preferences and reset notes. Export first if you want a copy.")) return; ["jarins-life-records-v1", "jarins-inbox", PREFERENCES_KEY, "jarins-weekly-reset-v1"].forEach((key) => localStorage.removeItem(key)); router.push("/today"); router.refresh(); };
  return <><PageIntro eyebrow="Make jarins yours" title={active[0].toUpperCase() + active.slice(1)} description="Preferences and data controls saved on this device." /><div className="settings-layout"><nav>{links.map((item) => <Link key={item} href={`/settings/${item.toLowerCase()}`} className={active === item.toLowerCase() ? "active" : ""}>{item}<ChevronRight size={15} /></Link>)}</nav><section className="settings-panel"><h2>{active === "data" ? "Your data" : active === "privacy" ? "Privacy controls" : active === "notifications" ? "Notifications" : active === "household" ? "Household" : "Profile preferences"}</h2>{active === "data" ? <><p>Download a readable backup, restore one on another browser, or reset this device.</p><input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importData(event)} /><div className="settings-actions"><button className="button secondary" onClick={exportData}><Download size={16} /> Export JSON</button><button className="button secondary" onClick={() => importInput.current?.click()}><Upload size={16} /> Import backup</button><button className="button danger" onClick={resetData}><Trash2 size={16} /> Reset this device</button></div>{dataMessage && <p className="data-message" role="status">{dataMessage}</p>}</> : active === "privacy" ? <><label className="toggle-row"><span><strong>Minimal analytics</strong><small>No document contents or sensitive form values are collected</small></span><input type="checkbox" checked={draft.minimalAnalytics} onChange={(event) => patchPreference("minimalAnalytics", event.target.checked)} /></label><label className="toggle-row"><span><strong>AI features</strong><small>Off by default for family and document data</small></span><input type="checkbox" checked={draft.aiFeatures} onChange={(event) => patchPreference("aiFeatures", event.target.checked)} /></label></> : active === "notifications" ? <label className="toggle-row"><span><strong>Reminder preferences</strong><small>Keep date-aware items visible in Today and Calendar</small></span><input type="checkbox" checked={draft.reminders} onChange={(event) => patchPreference("reminders", event.target.checked)} /></label> : active === "household" ? <><label className="input-row">Household name<input value={draft.household} onChange={(event) => patchPreference("household", event.target.value)} /></label><button className="button primary" onClick={() => save()}>Save household</button></> : <><label className="input-row">Display name<input value={draft.name} onChange={(event) => patchPreference("name", event.target.value)} /></label><label className="input-row">Timezone<input value={draft.timezone} onChange={(event) => patchPreference("timezone", event.target.value)} /></label><label className="input-row">Locale<select value={draft.locale} onChange={(event) => patchPreference("locale", event.target.value)}><option value="en">English</option><option value="de">Deutsch</option></select></label><button className="button primary" onClick={() => save()}>Save profile</button></>}<span className="save-state" role="status">{saved ? "Saved on this device" : ""}</span></section></div></>;
}

function Onboarding() {
  const [step, setStep] = useState(0);
  const [priorities, setPriorities] = useState<string[]>([]);
  const { records, add } = useLifeRecords();
  const steps = ["Welcome", "Life areas", "Family", "Current priorities", "Weekly rhythm", "Ready"];
  const headings = ["Your whole life, held gently.", "Choose what belongs here.", "Who are you planning with?", "What would make life lighter?", "Set a rhythm, not a regime.", "Your Today screen is ready."];
  const descriptions = ["Start small. Nothing needs to be configured perfectly before jarins becomes useful.", "Modules can be hidden or changed later.", "Only add the family details that are useful for planning.", "Choose up to three priorities for this season.", "Sunday is a gentle default for the weekly reset.", "Capture anything, protect three outcomes, and let the rest wait."];
  const options = ["Calmer mornings", "Household organization", "Learning German", "Career comeback", "Health routines", "Paperwork"];
  const toggle = (item: string) => setPriorities((current) => current.includes(item) ? current.filter((value) => value !== item) : current.length < 3 ? [...current, item] : current);
  const finish = () => priorities.filter((title) => !records.some((record) => record.module === "future" && record.title === title)).forEach((title) => add({ module: "future", kind: "This month", title, detail: "Chosen during setup. Edit this to add one small next action.", status: "open", progress: 0 }));
  return <div className="onboarding"><div className="onboarding-brand"><span className="brand-mark">j.</span><strong>jarins</strong></div><div className="onboarding-progress">{steps.map((item, index) => <span className={index <= step ? "active" : ""} key={item} />)}</div><span className="eyebrow">Step {step + 1} · {steps[step]}</span><h1>{headings[step]}</h1><p>{descriptions[step]}</p>{step === 3 && <div className="chips onboarding-chips">{options.map((item) => <button className={priorities.includes(item) ? "selected" : ""} onClick={() => toggle(item)} key={item}>{item}</button>)}</div>}<div className="onboarding-actions"><button className="button secondary" disabled={step === 0} onClick={() => setStep((x) => x - 1)}>Back</button>{step < steps.length - 1 ? <button className="button primary" onClick={() => setStep((x) => x + 1)}>Continue <ArrowRight size={16} /></button> : <Link className="button primary" href="/today" onClick={finish}>Open Today <ArrowRight size={16} /></Link>}</div></div>;
}

function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (mode: "password" | "magic") => { setBusy(true); setMessage(""); const supabase = createSupabaseBrowserClient(); if (!supabase) { setMessage("Connect Supabase in apps/web/.env.local to enable secure sign-in."); setBusy(false); return; } const result = mode === "password" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/today` } }); setMessage(result.error?.message ?? (mode === "magic" ? "Check your email for a secure sign-in link." : "Signed in. Opening Today…")); if (!result.error && mode === "password") router.push("/today"); setBusy(false); };
  return <div className="login-layout"><section className="login-message"><div className="brand"><span className="brand-mark">j.</span><span><strong>jarins</strong><small>Life OS</small></span></div><span className="eyebrow light">Private by design</span><h1>Life feels lighter when it doesn’t all live in your head.</h1><p>Your family, plans, learning and future — calm, clear and yours.</p></section><section className="login-card"><span className="eyebrow">Welcome back</span><h2>Sign in to your space</h2><label className="input-row">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="input-row">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="login-status" role="status">{message}</p>}<button className="button primary" disabled={busy || !email || !password} onClick={() => void submit("password")}>Sign in</button><button className="button secondary" disabled={busy || !email} onClick={() => void submit("magic")}>Email me a magic link</button><p className="login-footnote">Verified email required. We never put auth tokens in logs.</p></section></div>;
}

function Empty({ title, body = "This space is ready when you are. Add only what reduces future mental load." }: { title: string; body?: string }) { return <section className="empty-state"><span className="feature-icon green"><FileUp size={22} /></span><h2>{title}</h2><p>{body}</p></section>; }
