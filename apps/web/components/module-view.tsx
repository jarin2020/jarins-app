"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Download, FileUp, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { findModule } from "@/lib/modules";
import { moduleData } from "@/lib/sample-data";
import { type CapturedItem, readInbox } from "./quick-capture";
import { createSupabaseBrowserClient } from "@/lib/supabase";

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

function PageIntro({ eyebrow, title, description, action = "Add item" }: { eyebrow: string; title: string; description: string; action?: string }) {
  return <header className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><button className="button dark"><Plus size={17} /> {action}</button></header>;
}

function LifeModule({ root, subsection }: { root: string; subsection?: string }) {
  const currentModule = findModule(root);
  const data = moduleData[root as keyof typeof moduleData];
  if (!data) return <Empty title={currentModule.label} />;
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
    <PageIntro eyebrow={currentModule.eyebrow} title={subsection ? subsection.replaceAll("-", " ") : currentModule.label} description={currentModule.description} action={root === "documents" ? "Upload document" : root === "self" ? "Check in" : "Add item"} />
    <nav className="subnav" aria-label={`${currentModule.label} sections`}>{subnav[root]?.map((item) => { const part = item.toLowerCase().replaceAll(" ", "-"); const href = part === "overview" ? `/${root}` : `/${root}/${part}`; return <Link key={item} href={href} className={(subsection ?? "overview") === part ? "active" : ""}>{item}</Link>; })}</nav>
    <div className="stat-grid">{data.stats.map(([value, label]) => <div className="stat-card" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    {root === "self" && <CheckinPanel />}
    {root === "career" && <CareerTrail />}
    {root === "documents" && <PrivacyNotice />}
    <section className="module-grid">{data.cards.map(([kicker, badge, title, description]) => <article className="module-card" key={title}><div className="module-card-top"><span className="kicker">{kicker}</span><span className="status">{badge}</span></div><span className={`feature-icon ${root}`}><currentModule.icon size={19} /></span><h2>{title}</h2><p>{description}</p><button className="text-button">Open <ArrowRight size={15} /></button></article>)}</section>
    <section className="empty-state-inline"><div><h2>A calm place to start</h2><p>Add only what you want jarins to help you remember, decide or find.</p></div><button className="button secondary">Create your first real item</button></section>
  </>;
}

function CheckinPanel() {
  const [energy, setEnergy] = useState(3);
  return <section className="checkin-panel"><div><span className="kicker">Today’s check-in</span><h2>How are you arriving today?</h2><p>Your answer only changes which routine version we suggest.</p></div><div className="energy-scale" role="group" aria-label="Energy level">{[1,2,3,4,5].map((value) => <button key={value} className={energy === value ? "active" : ""} onClick={() => setEnergy(value)}><strong>{value}</strong><span>{["Very low", "Low", "Okay", "Good", "Full"][value - 1]}</span></button>)}</div><div className="soft-notice"><span>{energy <= 2 ? "Minimum morning: water, get dressed, 3-minute plan." : "Ideal morning: 30 minutes with a gentle plan."}</span></div></section>;
}

function CareerTrail() { return <section className="career-trail"><span className="kicker">My transition</span><h2>A coherent progression, backed by evidence</h2><div>{["Caregiving period", "German B1", "B2 Beruf", "Digital Marketing", "Portfolio", "Return to work"].map((item, index) => <div className={index < 2 ? "complete" : index === 2 ? "active" : ""} key={item}><span>{index < 2 ? <Check size={13} /> : index + 1}</span><strong>{item}</strong><small>{index === 2 ? "Current focus" : index < 2 ? "Evidence saved" : "Next"}</small></div>)}</div></section>; }
function PrivacyNotice() { return <aside className="privacy-notice"><ShieldCheck size={22} /><div><strong>Private by default</strong><p>Production uploads use private Supabase buckets and short-lived signed links. Sensitive files are never sent to AI without explicit opt-in.</p></div><button className="text-button">Privacy settings <ChevronRight size={15} /></button></aside>; }

function InboxView() {
  const [items, setItems] = useState<CapturedItem[]>([]);
  useEffect(() => { const load = () => setItems(readInbox()); load(); window.addEventListener("jarins-inbox-changed", load); return () => window.removeEventListener("jarins-inbox-changed", load); }, []);
  const remove = (id: string) => { const next = items.filter((item) => item.id !== id); setItems(next); localStorage.setItem("jarins-inbox", JSON.stringify(next)); };
  return <><PageIntro eyebrow="Captured, not forgotten" title="Inbox" description="Organize what you captured when you have the space." action="Capture item" />{items.length ? <section className="list-surface">{items.map((item) => <article className="inbox-row" key={item.id}><span className="feature-icon green"><Check size={17} /></span><div><strong>{item.text}</strong><p>{item.category} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p></div><div><button className="button secondary small">Process</button><button className="icon-button" onClick={() => remove(item.id)} aria-label={`Remove ${item.text}`}><Trash2 size={17} /></button></div></article>)}</section> : <Empty title="Your inbox is clear" body="Nothing urgent here. That is allowed. Use Quick capture whenever something enters your head." />}</>;
}

const searchableSamples = ["Kita preparation", "B2 speaking session", "Insurance renewal", "B1 certificate", "Family dinner", "Career transition narrative"];
function SearchView() { const [query, setQuery] = useState(""); const matches = useMemo(() => query ? searchableSamples.filter((x) => x.toLowerCase().includes(query.toLowerCase())) : [], [query]); return <><PageIntro eyebrow="Find, don’t remember" title="Search" description="Search across tasks, people, documents and learning." action="Filters" /><div className="large-search"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘certificate’ or ‘Kita’…" /></div>{query && <section className="list-surface"><span className="kicker">{matches.length} results</span>{matches.map((item) => <div className="search-result" key={item}><strong>{item}</strong><span>Open <ArrowRight size={14} /></span></div>)}</section>}</>; }

function CalendarView() { const days = Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; }); return <><PageIntro eyebrow="The shape of your week" title="Calendar" description="Family events, appointments and protected time in one place." action="Add event" /><div className="calendar-grid">{days.map((date, index) => <div className={index === 0 ? "today" : ""} key={date.toISOString()}><span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong>{[1,3,5,8,11].includes(index) && <small>{index === 1 ? "Kita" : index === 3 ? "B2 class" : "Family"}</small>}</div>)}</div><section className="list-surface"><h2>Upcoming</h2>{["Tomorrow prep · 19:15", "B2 session · Thursday 20:45", "Protected walk · Saturday 10:00"].map((item) => <div className="search-result" key={item}><strong>{item}</strong><ChevronRight size={16} /></div>)}</section></>; }

function WeeklyReset() {
  const steps = ["Empty Inbox", "Review last week", "Family calendar", "Admin and deadlines", "Meals and groceries", "Home routines", "Three weekly outcomes", "Protect learning blocks", "Protected personal time", "Check next 14 days", "Finish gently"];
  const [current, setCurrent] = useState(0); const [complete, setComplete] = useState<number[]>([]);
  return <><PageIntro eyebrow="25–35 quiet minutes" title="Weekly reset" description="A guided review so next week depends less on memory." action="Quick 5-minute reset" /><div className="reset-layout"><ol className="reset-steps">{steps.map((step, index) => <li key={step} className={complete.includes(index) ? "complete" : current === index ? "active" : ""}><button onClick={() => setCurrent(index)}><span>{complete.includes(index) ? <Check size={13} /> : index + 1}</span>{step}</button></li>)}</ol><section className="reset-workspace"><span className="kicker">Step {current + 1} of {steps.length}</span><h2>{steps[current]}</h2><p>{current === 0 ? "Look at each capture once. Turn it into an action, keep it as a note, or let it go." : "Notice what matters without judging last week. A minimum plan is still a plan."}</p><textarea aria-label="Weekly reset notes" placeholder="A few useful notes…" /><div className="reset-actions"><button className="button secondary" disabled={current === 0} onClick={() => setCurrent((x) => x - 1)}>Back</button><button className="button primary" onClick={() => { setComplete((items) => [...new Set([...items, current])]); setCurrent((x) => Math.min(steps.length - 1, x + 1)); }}>{current === steps.length - 1 ? "Finish reset" : "Complete and continue"}</button></div></section></div></>;
}

function SettingsView({ section }: { section?: string }) { const links = ["Profile", "Household", "Notifications", "Privacy", "Data"]; return <><PageIntro eyebrow="Make jarins yours" title={section ? section[0].toUpperCase() + section.slice(1) : "Settings"} description="Your preferences, privacy and data controls." action="Save changes" /><div className="settings-layout"><nav>{links.map((item) => <Link key={item} href={`/settings/${item.toLowerCase()}`} className={(section ?? "profile") === item.toLowerCase() ? "active" : ""}>{item}<ChevronRight size={15} /></Link>)}</nav><section className="settings-panel"><h2>{section === "data" ? "Your data" : section === "privacy" ? "Privacy controls" : "Profile preferences"}</h2>{section === "data" ? <><p>Export a copy of your data or request account deletion. Production deletion requires confirmation and propagates to private storage.</p><button className="button secondary"><Download size={16} /> Export JSON</button><button className="button danger"><Trash2 size={16} /> Delete account</button></> : section === "privacy" ? <><label className="toggle-row"><span><strong>Minimal analytics</strong><small>Never capture document contents or sensitive form values</small></span><input type="checkbox" /></label><label className="toggle-row"><span><strong>AI features</strong><small>Off by default for family and document data</small></span><input type="checkbox" /></label></> : <><label className="input-row">Display name<input defaultValue="Faria" /></label><label className="input-row">Timezone<input defaultValue="Europe/Berlin" /></label><label className="input-row">Locale<select defaultValue="en"><option value="en">English</option><option value="de">Deutsch</option></select></label></>}</section></div></>; }

function Onboarding() { const [step, setStep] = useState(0); const steps = ["Welcome", "Life areas", "Family", "Current priorities", "Weekly rhythm", "Ready"]; return <div className="onboarding"><div className="onboarding-brand"><span className="brand-mark">j.</span><strong>jarins</strong></div><div className="onboarding-progress">{steps.map((item, index) => <span className={index <= step ? "active" : ""} key={item} />)}</div><span className="eyebrow">Step {step + 1} · {steps[step]}</span><h1>{["Your whole life, held gently.", "Choose what belongs here.", "Who are you planning with?", "What would make life lighter?", "Set a rhythm, not a regime.", "Your Today screen is ready."][step]}</h1><p>{["Start small. Nothing needs to be configured perfectly before jarins becomes useful.", "Modules can be hidden or changed later.", "Only add the family details that are useful for planning.", "Choose up to three priorities for this season.", "Sunday is a gentle default for the weekly reset.", "Capture anything, protect three outcomes, and let the rest wait."][step]}</p>{step === 3 && <div className="chips onboarding-chips">{["Calmer mornings", "Household organization", "Learning German", "Career comeback", "Health routines", "Paperwork"].map((item) => <button key={item}>{item}</button>)}</div>}<div className="onboarding-actions"><button className="button secondary" disabled={step === 0} onClick={() => setStep((x) => x - 1)}>Back</button>{step < steps.length - 1 ? <button className="button primary" onClick={() => setStep((x) => x + 1)}>Continue <ArrowRight size={16} /></button> : <Link className="button primary" href="/today">Open Today <ArrowRight size={16} /></Link>}</div></div>; }

function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (mode: "password" | "magic") => { setBusy(true); setMessage(""); const supabase = createSupabaseBrowserClient(); if (!supabase) { setMessage("Connect Supabase in apps/web/.env.local to enable secure sign-in."); setBusy(false); return; } const result = mode === "password" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/today` } }); setMessage(result.error?.message ?? (mode === "magic" ? "Check your email for a secure sign-in link." : "Signed in. Opening Today…")); if (!result.error && mode === "password") router.push("/today"); setBusy(false); };
  return <div className="login-layout"><section className="login-message"><div className="brand"><span className="brand-mark">j.</span><span><strong>jarins</strong><small>Life OS</small></span></div><span className="eyebrow light">Private by design</span><h1>Life feels lighter when it doesn’t all live in your head.</h1><p>Your family, plans, learning and future — calm, clear and yours.</p></section><section className="login-card"><span className="eyebrow">Welcome back</span><h2>Sign in to your space</h2><label className="input-row">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="input-row">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="login-status" role="status">{message}</p>}<button className="button primary" disabled={busy || !email || !password} onClick={() => void submit("password")}>Sign in</button><button className="button secondary" disabled={busy || !email} onClick={() => void submit("magic")}>Email me a magic link</button><p className="login-footnote">Verified email required. We never put auth tokens in logs.</p></section></div>;
}

function Empty({ title, body = "This space is ready when you are. Add only what reduces future mental load." }: { title: string; body?: string }) { return <section className="empty-state"><span className="feature-icon green"><FileUp size={22} /></span><h2>{title}</h2><p>{body}</p></section>; }
