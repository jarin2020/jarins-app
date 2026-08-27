"use client";

import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, ChevronRight, CircleAlert, Clock3, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { essentials as initialEssentials, outcomes, schedule } from "@/lib/sample-data";

export function TodayView() {
  const [essentials, setEssentials] = useState(initialEssentials);
  const status = useMemo(() => essentials.filter((item) => item.done).length, [essentials]);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(new Date());
  return <>
    <section className="today-hero">
      <div className="hero-message"><span className="eyebrow light">{date}</span><h1>{greeting}, Faria.<br />Let’s protect the essentials.</h1><p>Three meaningful priorities are enough. Everything else can wait, move, or become smaller.</p><div className="hero-actions"><Link href="/reset/weekly" className="button light"><CalendarCheck size={17} /> Plan the week</Link><button className="button glass">Make today lighter</button></div></div>
      <div className="essentials-snapshot"><div className="card-heading"><div><span className="kicker">Today snapshot</span><h2>Balanced, not perfect</h2></div><span className="status good">On track</span></div><div className="snapshot-main"><div className="count-ring"><strong>{status}</strong><span>of {essentials.length}</span></div><div><strong>Enough for today</strong><p>User-chosen essentials — no hidden score.</p></div></div><div className="soft-notice"><Sparkles size={16} /><span>Protect your evening energy. The minimum version counts.</span></div></div>
    </section>

    <section aria-labelledby="top-three-title"><div className="section-heading"><div><span className="eyebrow">Your focus</span><h2 id="top-three-title">Today’s top three</h2></div><button className="text-button">Edit outcomes <ChevronRight size={15} /></button></div><div className="outcome-grid">{outcomes.map((item, index) => <article className={`outcome-card ${item.tone}`} key={item.area}><div className="outcome-top"><span>{String(index + 1).padStart(2, "0")} · {item.area}</span><button aria-label={`Open ${item.title}`}><ArrowRight size={17} /></button></div><h3>{item.title}</h3><p>{item.note}</p><div className="progress-track" aria-label={`${item.progress}% complete`}><span style={{ width: `${item.progress}%` }} /></div></article>)}</div></section>

    <div className="two-column">
      <section className="surface-card"><div className="card-heading"><div><span className="kicker">Next up</span><h2>Today’s flow</h2></div><span className="status">{schedule.length} items</span></div><div className="timeline-list">{schedule.map((event) => <div className="timeline-item" key={event.time}><time>{event.time}</time><span className={`timeline-marker ${event.tone}`} /><div><strong>{event.title}</strong><p>{event.meta}</p></div></div>)}</div></section>
      <section className="surface-card"><div className="card-heading"><div><span className="kicker">Essentials</span><h2>Only what matters</h2></div><span className="status good">{status} done</span></div><div className="check-list">{essentials.map((item) => <label key={item.id} className={item.done ? "done" : ""}><input type="checkbox" checked={item.done} onChange={() => setEssentials((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))} /><span className="custom-check">{item.done && <Check size={13} />}</span><span><strong>{item.title}</strong><small>{item.meta}</small></span></label>)}</div></section>
    </div>

    <div className="two-column uneven">
      <section className="surface-card"><div className="card-heading"><div><span className="kicker">Career bridge</span><h2>One next action</h2></div><span className="status warm">20 min</span></div><div className="bridge-action"><span className="feature-icon career"><Sparkles size={20} /></span><div><strong>Practise one B2 interview answer</strong><p>Connect your language progress to the professional story you are building.</p></div><button className="round-arrow" aria-label="Start action"><ArrowRight size={18} /></button></div><div className="milestone-row">{["B1 certified", "B2 Beruf", "Digital Marketing", "Return to work"].map((step, index) => <div key={step} className={index === 0 ? "complete" : index === 1 ? "active" : ""}><span>{index === 0 ? <Check size={13} /> : index + 1}</span><strong>{step}</strong></div>)}</div></section>
      <section className="surface-card risk-card"><div className="card-heading"><div><span className="kicker">Memory prompts</span><h2>Before it becomes urgent</h2></div><CircleAlert size={19} /></div><div className="risk-item"><span className="feature-icon warm"><Clock3 size={18} /></span><div><strong>Insurance renewal</strong><p>Due in 12 days · Home</p></div></div><div className="risk-item"><span className="feature-icon family"><CalendarCheck size={18} /></span><div><strong>Kita form</strong><p>Due tomorrow · Child A</p></div></div></section>
    </div>

    <section className="reset-banner"><span className="feature-icon warm"><RotateCcw size={22} /></span><div><span className="kicker">Sunday ritual</span><h2>Your weekly reset</h2><p>Empty the inbox, check the next 14 days, choose three outcomes and protect one future-building block.</p></div><Link href="/reset/weekly" className="button dark">Start guided reset <ArrowRight size={16} /></Link></section>
  </>;
}
