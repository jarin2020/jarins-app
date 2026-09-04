export const calendarProviders = [
  "google",
  "microsoft",
  "apple",
  "caldav",
] as const;

export type CalendarProvider = (typeof calendarProviders)[number];
export type CalendarSyncMode = "two-way" | "read-only";
export type CalendarConnectionStatus =
  "connecting" | "active" | "syncing" | "error";

export type CalendarSource = {
  id: string;
  accountId: string;
  providerCalendarId: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
  canWrite: boolean;
  selected: boolean;
};

export type CalendarAccount = {
  id: string;
  provider: CalendarProvider;
  address: string;
  label: string;
  status: CalendarConnectionStatus;
  syncMode: CalendarSyncMode;
  included: boolean;
  shareWithHousehold: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  eventCount: number;
  sources: CalendarSource[];
};

export type CalendarPerson = {
  name?: string;
  address?: string;
  response?: string;
};

export type CalendarEvent = {
  id: string;
  sourceId: string;
  accountId: string;
  ownerUserId: string;
  ownerName: string;
  sourceName: string;
  providerEventId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  status: "confirmed" | "tentative" | "cancelled";
  organizer: CalendarPerson | null;
  attendees: CalendarPerson[];
  recurrence: string[];
  editable: boolean;
  sharedWithHousehold: boolean;
};

export type CalendarEventInput = {
  sourceId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  timezone?: string;
  attendees?: { name?: string; address: string }[];
};

export const calendarProviderLabels: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  microsoft: "Microsoft Calendar",
  apple: "Apple Calendar",
  caldav: "CalDAV / custom",
};
