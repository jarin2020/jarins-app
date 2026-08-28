"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModuleKey } from "./modules";

export type RecordStatus = "open" | "in-progress" | "done" | "paused";

export type LifeRecord = {
  id: string;
  module: Exclude<ModuleKey, "today" | "inbox" | "calendar" | "search" | "settings">;
  kind: string;
  title: string;
  detail: string;
  date?: string;
  status: RecordStatus;
  amount?: number;
  progress?: number;
  essential?: boolean;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "jarins-life-records-v1";
const EVENT_NAME = "jarins-life-records-changed";

const day = (offset: number) => {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
};

const seed: LifeRecord[] = [
  { id: "family-kita", module: "family", kind: "Routine", title: "Prepare Kita bags", detail: "Water bottles, spare clothes, weather check and library book.", date: day(1), status: "open", essential: true, createdAt: day(-4), updatedAt: day(-1) },
  { id: "family-clothes", module: "family", kind: "Clothing", title: "Seasonal clothing check", detail: "Check current trouser, jacket and shoe sizes before buying anything.", date: day(4), status: "open", createdAt: day(-3), updatedAt: day(-3) },
  { id: "home-meal", module: "home", kind: "Meal", title: "Three simple dinners", detail: "Pasta and vegetables · chicken tray bake · lentil soup.", date: day(0), status: "in-progress", progress: 67, essential: true, createdAt: day(-2), updatedAt: day(0) },
  { id: "home-groceries", module: "home", kind: "Grocery", title: "Weekly essentials", detail: "Milk · eggs · berries · cucumber · bread · yoghurt.", date: day(1), status: "open", createdAt: day(-1), updatedAt: day(-1) },
  { id: "self-time", module: "self", kind: "Protected time", title: "Quiet walk", detail: "Twenty minutes without errands or another productivity goal.", date: day(0), status: "open", essential: true, createdAt: day(-1), updatedAt: day(-1) },
  { id: "learning-b2", module: "learning", kind: "Study session", title: "B2 speaking practice", detail: "Practise one interview answer and five useful phrases.", date: day(0), status: "open", progress: 40, essential: true, createdAt: day(-3), updatedAt: day(0) },
  { id: "learning-dm", module: "learning", kind: "Program", title: "Digital Marketing foundations", detail: "Current focus: SEO research and campaign measurement.", date: day(12), status: "in-progress", progress: 28, createdAt: day(-20), updatedAt: day(-1) },
  { id: "career-b1", module: "career", kind: "Evidence", title: "German B1 certificate", detail: "Language foundation completed; certificate indexed in Documents.", date: day(-90), status: "done", progress: 100, createdAt: day(-30), updatedAt: day(-5) },
  { id: "career-narrative", module: "career", kind: "Transition", title: "Professional transition narrative", detail: "Caregiving → German language growth → Digital Marketing training → portfolio.", date: day(7), status: "in-progress", progress: 45, createdAt: day(-6), updatedAt: day(-1) },
  { id: "money-insurance", module: "money", kind: "Annual cost", title: "Household insurance renewal", detail: "Review coverage and renewal notice before payment.", date: day(12), status: "open", amount: 180, createdAt: day(-4), updatedAt: day(-4) },
  { id: "money-course", module: "money", kind: "Education cost", title: "B2 exam fee", detail: "Set aside the fee before registration opens.", date: day(30), status: "in-progress", amount: 195, progress: 50, createdAt: day(-10), updatedAt: day(-2) },
  { id: "docs-insurance", module: "documents", kind: "Insurance", title: "Insurance policy", detail: "Issuer: household insurer · sensitivity: sensitive.", date: day(12), status: "open", createdAt: day(-5), updatedAt: day(-5) },
  { id: "docs-b1", module: "documents", kind: "Certificate", title: "German B1 certificate", detail: "Language certificate · owner: Faria · sensitivity: normal.", status: "done", createdAt: day(-20), updatedAt: day(-5) },
  { id: "future-family", module: "future", kind: "This month", title: "Calmer morning rhythm", detail: "Prepare the essentials in the evening on four weekdays.", date: day(30), status: "in-progress", progress: 55, createdAt: day(-10), updatedAt: day(-1) },
  { id: "future-career", module: "future", kind: "12 months", title: "Portfolio-ready marketing skills", detail: "Complete training and publish two honest evidence projects.", date: day(365), status: "in-progress", progress: 20, createdAt: day(-10), updatedAt: day(-1) },
];

const parse = (value: string | null): LifeRecord[] => {
  if (!value) return seed;
  try { const records = JSON.parse(value) as LifeRecord[]; return Array.isArray(records) ? records : seed; } catch { return seed; }
};

export function readLifeRecords() {
  if (typeof window === "undefined") return seed;
  const records = parse(localStorage.getItem(STORAGE_KEY));
  if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return records;
}

function writeLifeRecords(records: LifeRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function replaceLifeRecords(records: LifeRecord[]) {
  if (!Array.isArray(records) || records.some((record) => !record?.id || !record?.module || !record?.title)) throw new Error("This backup does not contain valid life records.");
  writeLifeRecords(records);
}

export function useLifeRecords() {
  const [records, setRecords] = useState<LifeRecord[]>([]);
  useEffect(() => {
    const load = () => setRecords(readLifeRecords());
    load(); window.addEventListener(EVENT_NAME, load); window.addEventListener("storage", load);
    return () => { window.removeEventListener(EVENT_NAME, load); window.removeEventListener("storage", load); };
  }, []);
  const add = useCallback((input: Omit<LifeRecord, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    writeLifeRecords([{ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, ...readLifeRecords()]);
  }, []);
  const update = useCallback((id: string, changes: Partial<LifeRecord>) => {
    writeLifeRecords(readLifeRecords().map((record) => record.id === id ? { ...record, ...changes, updatedAt: new Date().toISOString() } : record));
  }, []);
  const remove = useCallback((id: string) => writeLifeRecords(readLifeRecords().filter((record) => record.id !== id)), []);
  return { records, add, update, remove };
}

export const moduleLabels: Record<LifeRecord["module"], string> = {
  family: "Family", home: "Home", self: "Self", learning: "Learning", career: "Career", money: "Money", documents: "Documents", future: "Future",
};

export const kindOptions: Record<LifeRecord["module"], string[]> = {
  family: ["Event", "Routine", "Child note", "Clothing", "Packing list", "Memory", "Task"],
  home: ["Meal", "Grocery", "Routine", "Maintenance", "Contract", "Task"],
  self: ["Check-in", "Protected time", "Routine", "Reflection", "Task"],
  learning: ["Program", "Study session", "Certificate", "Evidence", "Task"],
  career: ["Transition", "Timeline", "Evidence", "Portfolio", "Job readiness", "Task"],
  money: ["Monthly cost", "Annual cost", "One-off cost", "Subscription", "Savings goal", "Education cost", "Task"],
  documents: ["Identity", "Family", "Certificate", "Insurance", "Finance", "Home", "Medical admin", "Other", "Task"],
  future: ["This month", "3 months", "12 months", "3 years", "Someday", "Project", "Task"],
};
