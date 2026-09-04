import "server-only";

import type {
  CalendarEventInput,
  CalendarPerson,
  CalendarProvider,
} from "@/lib/calendar";
import {
  calendarClientId,
  calendarClientSecret,
  CalendarHttpError,
  type CalendarAccountRow,
  type CalendarCredentials,
  type CalendarEventRow,
  type CalendarOAuthCredentials,
  type CalendarRequestContext,
  type CalendarSourceRow,
  saveCalendarCredentials,
} from "@/lib/calendar-server";

type DiscoveredSource = {
  providerCalendarId: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
  canWrite: boolean;
};

export type ProviderEvent = Omit<
  CalendarEventRow,
  "id" | "source_id" | "account_id" | "owner_user_id" | "household_id"
>;

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  etag?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  organizer?: { displayName?: string; email?: string };
  attendees?: {
    displayName?: string;
    email?: string;
    responseStatus?: string;
  }[];
  recurrence?: string[];
};

type MicrosoftEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  location?: { displayName?: string };
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  showAs?: string;
  webLink?: string;
  changeKey?: string;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  attendees?: {
    emailAddress?: { name?: string; address?: string };
    status?: { response?: string };
  }[];
  recurrence?: unknown;
};

const syncPastDays = 90;
const syncFutureDays = 400;

function syncRange() {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - syncPastDays);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + syncFutureDays);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function providerJson<T>(
  url: string,
  init: RequestInit,
  message: string,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[jarins] calendar provider error",
      response.status,
      detail.slice(0, 500),
    );
    throw new CalendarHttpError(response.status === 401 ? 409 : 502, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function oauthAccessToken(
  context: CalendarRequestContext,
  account: CalendarAccountRow,
  credentials: CalendarOAuthCredentials,
) {
  if (credentials.expiresAt > Date.now() + 60_000)
    return credentials.accessToken;
  const provider = account.provider;
  if (provider !== "google" && provider !== "microsoft") {
    throw new CalendarHttpError(409, "Calendar OAuth credentials are invalid.");
  }
  const body = new URLSearchParams({
    client_id: calendarClientId(provider),
    client_secret: calendarClientSecret(provider),
    refresh_token: credentials.refreshToken,
    grant_type: "refresh_token",
  });
  if (provider === "microsoft") body.set("scope", credentials.scope);
  const token = await providerJson<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }>(
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    { method: "POST", body },
    "The calendar authorization expired. Reconnect this account.",
  );
  const next: CalendarOAuthCredentials = {
    kind: "oauth",
    accessToken: token.access_token,
    refreshToken: token.refresh_token || credentials.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope || credentials.scope,
  };
  await saveCalendarCredentials(context, account.id, next);
  Object.assign(credentials, next);
  return next.accessToken;
}

function oauthHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function basicHeaders(
  credentials: Extract<CalendarCredentials, { kind: "caldav" }>,
) {
  return {
    Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
  };
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function tagValue(xml: string, localName: string) {
  const match = xml.match(
    new RegExp(
      `<[^>]*:?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/[^>]*:?${localName}>`,
      "i",
    ),
  );
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : null;
}

function nestedHref(xml: string, localName: string) {
  const match = xml.match(
    new RegExp(
      `<[^>]*:?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/[^>]*:?${localName}>`,
      "i",
    ),
  );
  return match ? tagValue(match[1], "href") : null;
}

function multistatusResponses(xml: string) {
  return [
    ...xml.matchAll(
      /<[^>]*:?response(?:\s[^>]*)?>([\s\S]*?)<\/[^>]*:?response>/gi,
    ),
  ].map((match) => match[1]);
}

function secureCalDavUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CalendarHttpError(400, "Enter a valid CalDAV server URL.");
  }
  if (url.protocol !== "https:")
    throw new CalendarHttpError(400, "CalDAV connections must use HTTPS.");
  const host = url.hostname.toLowerCase();
  const unwrappedHost = host.replace(/^\[|\]$/g, "");
  if (
    unwrappedHost === "localhost" ||
    unwrappedHost.endsWith(".local") ||
    /^\d+$/.test(unwrappedHost) ||
    /^\d+(\.\d+){3}$/.test(unwrappedHost) ||
    unwrappedHost.includes(":") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      unwrappedHost,
    ) ||
    unwrappedHost === "::1" ||
    unwrappedHost.startsWith("fc") ||
    unwrappedHost.startsWith("fd") ||
    unwrappedHost.startsWith("fe80:")
  ) {
    throw new CalendarHttpError(
      400,
      "Private-network CalDAV servers are not supported.",
    );
  }
  url.username = "";
  url.password = "";
  return url;
}

async function davRequest(
  credentials: Extract<CalendarCredentials, { kind: "caldav" }>,
  url: string,
  method: string,
  body?: string,
  depth?: string,
) {
  let target = secureCalDavUrl(url);
  let response: Response | null = null;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    response = await fetch(target, {
      method,
      redirect: "manual",
      headers: {
        ...basicHeaders(credentials),
        ...(body ? { "Content-Type": "application/xml; charset=utf-8" } : {}),
        ...(depth ? { Depth: depth } : {}),
      },
      body,
    });
    if (![301, 302, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirects === 5)
      throw new CalendarHttpError(
        502,
        "The CalDAV server redirected too many times.",
      );
    target = secureCalDavUrl(new URL(location, target).href);
  }
  if (!response)
    throw new CalendarHttpError(502, "The CalDAV server did not respond.");
  if (!response.ok && response.status !== 207) {
    throw new CalendarHttpError(
      response.status === 401 || response.status === 403 ? 409 : 502,
      response.status === 401 || response.status === 403
        ? "CalDAV sign-in failed. Check the username and app password."
        : "The CalDAV server did not accept the request.",
    );
  }
  return {
    response,
    text: await response.text(),
    url: response.url || target.href,
  };
}

function absoluteDavUrl(base: string, href: string) {
  const result = new URL(href, base);
  return secureCalDavUrl(result.href).href;
}

export async function discoverCalDavCalendars(
  credentials: Extract<CalendarCredentials, { kind: "caldav" }>,
): Promise<DiscoveredSource[]> {
  const principalResult = await davRequest(
    credentials,
    credentials.serverUrl,
    "PROPFIND",
    '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:current-user-principal/><d:resourcetype/><d:displayname/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>',
    "0",
  );
  if (/<[^>]*:?calendar(?:\s|\/|>)/i.test(principalResult.text)) {
    const privileges = principalResult.text.toLowerCase();
    return [
      {
        providerCalendarId: secureCalDavUrl(principalResult.url).href,
        name: tagValue(principalResult.text, "displayname") || "Calendar",
        color: tagValue(principalResult.text, "calendar-color"),
        isPrimary: true,
        canWrite:
          privileges.includes("write-content") ||
          /:?write(?:\s|\/|>)/.test(privileges) ||
          !privileges.includes("current-user-privilege-set"),
      },
    ];
  }
  const principalHref = nestedHref(
    principalResult.text,
    "current-user-principal",
  );
  if (!principalHref)
    throw new CalendarHttpError(
      502,
      "The CalDAV server did not expose a user principal.",
    );
  const principalUrl = absoluteDavUrl(principalResult.url, principalHref);
  const homeResult = await davRequest(
    credentials,
    principalUrl,
    "PROPFIND",
    '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    "0",
  );
  const homeHref = nestedHref(homeResult.text, "calendar-home-set");
  if (!homeHref)
    throw new CalendarHttpError(
      502,
      "The CalDAV calendar home could not be discovered.",
    );
  const homeUrl = absoluteDavUrl(homeResult.url, homeHref);
  const calendars = await davRequest(
    credentials,
    homeUrl,
    "PROPFIND",
    '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:resourcetype/><d:displayname/><a:calendar-color/><cs:getctag/><d:current-user-privilege-set/></d:prop></d:propfind>',
    "1",
  );
  const sources = multistatusResponses(calendars.text)
    .filter((item) => /<[^>]*:?calendar(?:\s|\/|>)/i.test(item))
    .map((item, index) => {
      const href = tagValue(item, "href");
      if (!href) return null;
      const privileges = item.toLowerCase();
      return {
        providerCalendarId: absoluteDavUrl(calendars.url, href),
        name: tagValue(item, "displayname") || `Calendar ${index + 1}`,
        color: tagValue(item, "calendar-color"),
        isPrimary: index === 0,
        canWrite:
          privileges.includes("write-content") ||
          /:?write(?:\s|\/|>)/.test(privileges) ||
          privileges.includes("all") ||
          !privileges.includes("current-user-privilege-set"),
      };
    })
    .filter((source): source is DiscoveredSource => Boolean(source));
  if (!sources.length)
    throw new CalendarHttpError(
      502,
      "No event calendars were found on this CalDAV account.",
    );
  return sources;
}

export async function discoverOAuthCalendars(
  provider: "google" | "microsoft",
  accessToken: string,
): Promise<DiscoveredSource[]> {
  const sources: DiscoveredSource[] = [];
  let url =
    provider === "google"
      ? "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250"
      : "https://graph.microsoft.com/v1.0/me/calendars?$top=200";
  while (url) {
    const payload = await providerJson<{
      items?: {
        id: string;
        summary?: string;
        backgroundColor?: string;
        primary?: boolean;
        accessRole?: string;
      }[];
      value?: {
        id: string;
        name: string;
        color?: string;
        hexColor?: string;
        isDefaultCalendar?: boolean;
        canEdit?: boolean;
      }[];
      nextPageToken?: string;
      "@odata.nextLink"?: string;
    }>(
      url,
      { headers: oauthHeaders(accessToken) },
      "Calendar list could not be loaded.",
    );
    if (provider === "google") {
      sources.push(
        ...(payload.items ?? []).map((calendar) => ({
          providerCalendarId: calendar.id,
          name: calendar.summary || "Google Calendar",
          color: calendar.backgroundColor || null,
          isPrimary: Boolean(calendar.primary),
          canWrite: ["owner", "writer"].includes(calendar.accessRole || ""),
        })),
      );
      url = payload.nextPageToken
        ? `https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&pageToken=${encodeURIComponent(payload.nextPageToken)}`
        : "";
    } else {
      sources.push(
        ...(payload.value ?? []).map((calendar) => ({
          providerCalendarId: calendar.id,
          name: calendar.name || "Microsoft Calendar",
          color: calendar.hexColor || calendar.color || null,
          isPrimary: Boolean(calendar.isDefaultCalendar),
          canWrite: calendar.canEdit !== false,
        })),
      );
      const next = payload["@odata.nextLink"] || "";
      url = next.startsWith("https://graph.microsoft.com/") ? next : "";
    }
  }
  if (!sources.length)
    throw new CalendarHttpError(502, "The provider returned no calendars.");
  return sources;
}

export async function discoverAccountCalendars(
  context: CalendarRequestContext,
  account: CalendarAccountRow,
  credentials: CalendarCredentials,
) {
  if (
    (account.provider === "google" || account.provider === "microsoft") &&
    credentials.kind === "oauth"
  ) {
    return discoverOAuthCalendars(
      account.provider,
      await oauthAccessToken(context, account, credentials),
    );
  }
  if (
    (account.provider === "apple" || account.provider === "caldav") &&
    credentials.kind === "caldav"
  ) {
    return discoverCalDavCalendars(credentials);
  }
  throw new CalendarHttpError(
    409,
    "Calendar credentials do not match the provider.",
  );
}

export async function upsertDiscoveredSources(
  context: CalendarRequestContext,
  accountId: string,
  discovered: DiscoveredSource[],
) {
  const existing = await context.supabase
    .from("calendar_sources")
    .select("provider_calendar_id,selected")
    .eq("account_id", accountId);
  const selected = new Map(
    (existing.data ?? []).map((source) => [
      source.provider_calendar_id as string,
      source.selected as boolean,
    ]),
  );
  const rows = discovered.map((source) => ({
    account_id: accountId,
    user_id: context.user.id,
    provider_calendar_id: source.providerCalendarId,
    name: source.name.trim().slice(0, 160) || "Calendar",
    color: source.color,
    is_primary: source.isPrimary,
    can_write: source.canWrite,
    selected: selected.get(source.providerCalendarId) ?? source.isPrimary,
  }));
  const result = await context.supabase
    .from("calendar_sources")
    .upsert(rows, { onConflict: "account_id,provider_calendar_id" });
  if (result.error)
    throw new CalendarHttpError(500, "Calendar sources could not be saved.");
  const discoveredIds = new Set(
    discovered.map((source) => source.providerCalendarId),
  );
  const staleIds = (existing.data ?? [])
    .map((source) => source.provider_calendar_id as string)
    .filter((id) => !discoveredIds.has(id));
  if (staleIds.length) {
    const removed = await context.supabase
      .from("calendar_sources")
      .delete()
      .eq("account_id", accountId)
      .in("provider_calendar_id", staleIds);
    if (removed.error)
      throw new CalendarHttpError(
        500,
        "Removed calendar sources could not be reconciled.",
      );
  }
}

function googleDate(value: NonNullable<GoogleEvent["start"]>) {
  if (value.dateTime)
    return { iso: new Date(value.dateTime).toISOString(), allDay: false };
  const date = value.date || new Date().toISOString().slice(0, 10);
  return { iso: new Date(`${date}T00:00:00Z`).toISOString(), allDay: true };
}

function googleEvent(
  event: GoogleEvent,
  sourceName: string,
  ownerName: string,
): ProviderEvent {
  if (!event.start || !event.end)
    throw new CalendarHttpError(502, "Google returned an event without dates.");
  const start = googleDate(event.start);
  const end = googleDate(event.end);
  return {
    provider_event_id: event.id,
    source_name: sourceName,
    owner_name: ownerName,
    title: (event.summary || "Untitled event").slice(0, 500),
    description: (event.description || "").slice(0, 20000),
    location: (event.location || "").slice(0, 1000),
    starts_at: start.iso,
    ends_at: end.iso,
    all_day: start.allDay,
    timezone: event.start.timeZone || "UTC",
    status:
      event.status === "cancelled"
        ? "cancelled"
        : event.status === "tentative"
          ? "tentative"
          : "confirmed",
    organizer: event.organizer
      ? { name: event.organizer.displayName, address: event.organizer.email }
      : null,
    attendees: (event.attendees ?? []).map((person) => ({
      name: person.displayName,
      address: person.email,
      response: person.responseStatus,
    })),
    recurrence: event.recurrence ?? [],
    provider_etag: event.etag || null,
    provider_url: event.htmlLink || null,
  };
}

function microsoftDate(value: MicrosoftEvent["start"]) {
  const dateTime = /(?:Z|[+-]\d\d:\d\d)$/.test(value.dateTime)
    ? value.dateTime
    : `${value.dateTime}Z`;
  return new Date(dateTime).toISOString();
}

function microsoftEvent(
  event: MicrosoftEvent,
  sourceName: string,
  ownerName: string,
): ProviderEvent {
  const showAs = event.showAs?.toLowerCase();
  return {
    provider_event_id: event.id,
    source_name: sourceName,
    owner_name: ownerName,
    title: (event.subject || "Untitled event").slice(0, 500),
    description: (event.body?.content || event.bodyPreview || "").slice(
      0,
      20000,
    ),
    location: (event.location?.displayName || "").slice(0, 1000),
    starts_at: microsoftDate(event.start),
    ends_at: microsoftDate(event.end),
    all_day: Boolean(event.isAllDay),
    timezone: event.start.timeZone || "UTC",
    status: showAs === "tentative" ? "tentative" : "confirmed",
    organizer: event.organizer?.emailAddress
      ? {
          name: event.organizer.emailAddress.name,
          address: event.organizer.emailAddress.address,
        }
      : null,
    attendees: (event.attendees ?? []).map((person) => ({
      name: person.emailAddress?.name,
      address: person.emailAddress?.address,
      response: person.status?.response,
    })),
    recurrence: event.recurrence ? [JSON.stringify(event.recurrence)] : [],
    provider_etag: event.changeKey || null,
    provider_url: event.webLink || null,
  };
}

function unfoldIcs(value: string) {
  return value.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function icsValue(lines: string[], name: string) {
  const line = lines.find(
    (item) => item.split(":", 1)[0].split(";", 1)[0] === name,
  );
  return line ? line.slice(line.indexOf(":") + 1) : "";
}

function unescapeIcs(value: string) {
  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\N", "\n")
    .replaceAll("\\,", ",")
    .replaceAll("\\;", ";")
    .replaceAll("\\\\", "\\");
}

function zonedIcsDate(value: string, timezone: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(9, 11));
  const minute = Number(value.slice(11, 13));
  const second = Number(value.slice(13, 15));
  const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wanted;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(guess))
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, Number(part.value)]),
      );
      const rendered = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
      guess += wanted - rendered;
    }
    return new Date(guess).toISOString();
  } catch {
    return new Date(wanted).toISOString();
  }
}

function icsDate(value: string, timezone = "UTC") {
  if (/^\d{8}$/.test(value)) {
    return new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`,
    ).toISOString();
  }
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`,
    ).toISOString();
  }
  if (/^\d{8}T\d{6}$/.test(value)) {
    return zonedIcsDate(value, timezone);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()))
    throw new CalendarHttpError(
      502,
      "A CalDAV event contained an invalid date.",
    );
  return parsed.toISOString();
}

function parseCalendarData(
  calendarData: string,
  href: string,
  etag: string | null,
  sourceName: string,
  ownerName: string,
) {
  const lines = unfoldIcs(calendarData);
  const output: ProviderEvent[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      const uid = icsValue(current, "UID") || href;
      const recurrenceId = icsValue(current, "RECURRENCE-ID");
      const startRaw = icsValue(current, "DTSTART");
      const endRaw = icsValue(current, "DTEND") || startRaw;
      if (startRaw) {
        const status = icsValue(current, "STATUS").toUpperCase();
        const dtStartLine =
          current.find((item) => item.startsWith("DTSTART")) || "";
        const timezone = dtStartLine.match(/TZID=([^;:]+)/)?.[1] || "UTC";
        output.push({
          provider_event_id: recurrenceId ? `${uid}:${recurrenceId}` : uid,
          source_name: sourceName,
          owner_name: ownerName,
          title: (
            unescapeIcs(icsValue(current, "SUMMARY")) || "Untitled event"
          ).slice(0, 500),
          description: unescapeIcs(icsValue(current, "DESCRIPTION")).slice(
            0,
            20000,
          ),
          location: unescapeIcs(icsValue(current, "LOCATION")).slice(0, 1000),
          starts_at: icsDate(startRaw, timezone),
          ends_at: icsDate(endRaw, timezone),
          all_day:
            /^\d{8}$/.test(startRaw) || dtStartLine.includes("VALUE=DATE"),
          timezone,
          status:
            status === "CANCELLED"
              ? "cancelled"
              : status === "TENTATIVE"
                ? "tentative"
                : "confirmed",
          organizer: null,
          attendees: [],
          recurrence: current.filter((item) =>
            /^(RRULE|RDATE|EXDATE)/.test(item),
          ),
          provider_etag: etag,
          provider_url: href,
        });
      }
      current = null;
    } else if (current) current.push(line);
  }
  return output;
}

async function syncGoogle(
  token: string,
  source: CalendarSourceRow,
  ownerName: string,
) {
  const events: ProviderEvent[] = [];
  const removedIds: string[] = [];
  let nextSyncToken: string | null = null;
  let pageToken = "";
  const range = syncRange();
  do {
    const query = new URLSearchParams({
      maxResults: "2500",
      singleEvents: "true",
      showDeleted: "true",
    });
    if (source.sync_cursor) query.set("syncToken", source.sync_cursor);
    else {
      query.set("timeMin", range.from);
      query.set("timeMax", range.to);
    }
    if (pageToken) query.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.provider_calendar_id)}/events?${query}`;
    const response = await fetch(url, { headers: oauthHeaders(token) });
    if (response.status === 410 && source.sync_cursor) {
      return syncGoogle(token, { ...source, sync_cursor: null }, ownerName);
    }
    if (!response.ok)
      throw new CalendarHttpError(
        502,
        `Google could not synchronize ${source.name}.`,
      );
    const payload = (await response.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    for (const item of payload.items ?? []) {
      if (item.status === "cancelled" && (!item.start || !item.end))
        removedIds.push(item.id);
      else events.push(googleEvent(item, source.name, ownerName));
    }
    pageToken = payload.nextPageToken || "";
    nextSyncToken = payload.nextSyncToken || nextSyncToken;
  } while (pageToken);
  return {
    events,
    removedIds,
    cursor: nextSyncToken,
    incremental: Boolean(source.sync_cursor),
  };
}

async function syncMicrosoft(
  token: string,
  source: CalendarSourceRow,
  ownerName: string,
) {
  const events: ProviderEvent[] = [];
  const range = syncRange();
  let url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.provider_calendar_id)}/calendarView?startDateTime=${encodeURIComponent(range.from)}&endDateTime=${encodeURIComponent(range.to)}&$top=1000`;
  while (url) {
    const payload = await providerJson<{
      value: MicrosoftEvent[];
      "@odata.nextLink"?: string;
    }>(
      url,
      { headers: oauthHeaders(token, { Prefer: 'outlook.timezone="UTC"' }) },
      `Microsoft could not synchronize ${source.name}.`,
    );
    events.push(
      ...payload.value.map((item) =>
        microsoftEvent(item, source.name, ownerName),
      ),
    );
    const next = payload["@odata.nextLink"] || "";
    url = next.startsWith("https://graph.microsoft.com/") ? next : "";
  }
  return { events, removedIds: [], cursor: null, incremental: false };
}

async function syncCalDav(
  credentials: Extract<CalendarCredentials, { kind: "caldav" }>,
  source: CalendarSourceRow,
  ownerName: string,
) {
  const range = syncRange();
  const format = (iso: string) =>
    iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const result = await davRequest(
    credentials,
    source.provider_calendar_id,
    "REPORT",
    `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data><c:expand start="${format(range.from)}" end="${format(range.to)}"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${format(range.from)}" end="${format(range.to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
    "1",
  );
  const events = multistatusResponses(result.text).flatMap((item) => {
    const href = tagValue(item, "href");
    const data = tagValue(item, "calendar-data");
    if (!href || !data) return [];
    return parseCalendarData(
      data,
      absoluteDavUrl(result.url, href),
      tagValue(item, "getetag"),
      source.name,
      ownerName,
    );
  });
  return { events, removedIds: [], cursor: null, incremental: false };
}

export async function syncCalendarSource(
  context: CalendarRequestContext,
  account: CalendarAccountRow,
  credentials: CalendarCredentials,
  source: CalendarSourceRow,
  ownerName: string,
) {
  if (!source.selected)
    return {
      events: [],
      removedIds: [],
      cursor: source.sync_cursor,
      incremental: true,
    };
  if (account.provider === "google" && credentials.kind === "oauth") {
    return syncGoogle(
      await oauthAccessToken(context, account, credentials),
      source,
      ownerName,
    );
  }
  if (account.provider === "microsoft" && credentials.kind === "oauth") {
    return syncMicrosoft(
      await oauthAccessToken(context, account, credentials),
      source,
      ownerName,
    );
  }
  if (
    (account.provider === "apple" || account.provider === "caldav") &&
    credentials.kind === "caldav"
  ) {
    return syncCalDav(credentials, source, ownerName);
  }
  throw new CalendarHttpError(
    409,
    "Calendar credentials do not match the provider.",
  );
}

function googleBody(input: CalendarEventInput) {
  if (input.allDay) {
    return {
      summary: input.title,
      description: input.description || "",
      location: input.location || "",
      start: { date: input.startsAt.slice(0, 10) },
      end: { date: input.endsAt.slice(0, 10) },
      attendees: input.attendees,
    };
  }
  return {
    summary: input.title,
    description: input.description || "",
    location: input.location || "",
    start: { dateTime: input.startsAt, timeZone: input.timezone || "UTC" },
    end: { dateTime: input.endsAt, timeZone: input.timezone || "UTC" },
    attendees: input.attendees,
  };
}

function microsoftBody(input: CalendarEventInput) {
  return {
    subject: input.title,
    body: { contentType: "text", content: input.description || "" },
    location: { displayName: input.location || "" },
    start: { dateTime: input.startsAt, timeZone: input.timezone || "UTC" },
    end: { dateTime: input.endsAt, timeZone: input.timezone || "UTC" },
    isAllDay: Boolean(input.allDay),
    attendees: (input.attendees ?? []).map((person) => ({
      emailAddress: { name: person.name, address: person.address },
      type: "required",
    })),
  };
}

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function icsTimestamp(value: string, allDay: boolean) {
  const date = new Date(value);
  if (allDay)
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function calendarIcs(
  input: CalendarEventInput,
  uid: string,
  organizerAddress: string,
) {
  const allDay = Boolean(input.allDay);
  const dateParam = allDay ? ";VALUE=DATE" : "";
  const attendees = (input.attendees ?? []).map(
    (person) =>
      `ATTENDEE;CN=${escapeIcs(person.name || person.address)}:mailto:${person.address}`,
  );
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jarins//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsTimestamp(new Date().toISOString(), false)}`,
    `DTSTART${dateParam}:${icsTimestamp(input.startsAt, allDay)}`,
    `DTEND${dateParam}:${icsTimestamp(input.endsAt, allDay)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    `DESCRIPTION:${escapeIcs(input.description || "")}`,
    `LOCATION:${escapeIcs(input.location || "")}`,
    ...(attendees.length ? [`ORGANIZER:mailto:${organizerAddress}`] : []),
    ...attendees,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export async function createProviderEvent(
  context: CalendarRequestContext,
  account: CalendarAccountRow,
  credentials: CalendarCredentials,
  source: CalendarSourceRow,
  input: CalendarEventInput,
  ownerName: string,
) {
  if (account.sync_mode !== "two-way" || !source.can_write)
    throw new CalendarHttpError(403, "This calendar is read only.");
  if (account.provider === "google" && credentials.kind === "oauth") {
    const token = await oauthAccessToken(context, account, credentials);
    const event = await providerJson<GoogleEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.provider_calendar_id)}/events?sendUpdates=all`,
      {
        method: "POST",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(googleBody(input)),
      },
      "Google could not create the event.",
    );
    return googleEvent(event, source.name, ownerName);
  }
  if (account.provider === "microsoft" && credentials.kind === "oauth") {
    const token = await oauthAccessToken(context, account, credentials);
    const event = await providerJson<MicrosoftEvent>(
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.provider_calendar_id)}/events`,
      {
        method: "POST",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(microsoftBody(input)),
      },
      "Microsoft could not create the event.",
    );
    return microsoftEvent(event, source.name, ownerName);
  }
  if (credentials.kind === "caldav") {
    const uid = crypto.randomUUID();
    const base = source.provider_calendar_id.endsWith("/")
      ? source.provider_calendar_id
      : `${source.provider_calendar_id}/`;
    const url = absoluteDavUrl(base, `${uid}.ics`);
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...basicHeaders(credentials),
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*",
      },
      body: calendarIcs(input, uid, account.address),
    });
    if (!response.ok)
      throw new CalendarHttpError(502, "CalDAV could not create the event.");
    return {
      provider_event_id: uid,
      source_name: source.name,
      owner_name: ownerName,
      title: input.title,
      description: input.description || "",
      location: input.location || "",
      starts_at: new Date(input.startsAt).toISOString(),
      ends_at: new Date(input.endsAt).toISOString(),
      all_day: Boolean(input.allDay),
      timezone: input.timezone || "UTC",
      status: "confirmed",
      organizer: null,
      attendees: (input.attendees ?? []) as CalendarPerson[],
      recurrence: [],
      provider_etag: response.headers.get("etag"),
      provider_url: url,
    } satisfies ProviderEvent;
  }
  throw new CalendarHttpError(
    409,
    "Calendar credentials do not match the provider.",
  );
}

export async function updateProviderEvent(
  context: CalendarRequestContext,
  account: CalendarAccountRow,
  credentials: CalendarCredentials,
  source: CalendarSourceRow,
  existing: CalendarEventRow,
  input: CalendarEventInput,
  ownerName: string,
) {
  if (account.sync_mode !== "two-way" || !source.can_write)
    throw new CalendarHttpError(403, "This calendar is read only.");
  if (
    (account.provider === "apple" || account.provider === "caldav") &&
    (existing.recurrence.length > 0 || existing.provider_event_id.includes(":"))
  ) {
    throw new CalendarHttpError(
      409,
      "Recurring CalDAV instances must be edited in their source calendar.",
    );
  }
  if (account.provider === "google" && credentials.kind === "oauth") {
    const token = await oauthAccessToken(context, account, credentials);
    const event = await providerJson<GoogleEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.provider_calendar_id)}/events/${encodeURIComponent(existing.provider_event_id)}?sendUpdates=all`,
      {
        method: "PATCH",
        headers: oauthHeaders(token, {
          "Content-Type": "application/json",
          ...(existing.provider_etag
            ? { "If-Match": existing.provider_etag }
            : {}),
        }),
        body: JSON.stringify(googleBody(input)),
      },
      "Google could not update the event. It may have changed elsewhere.",
    );
    return googleEvent(event, source.name, ownerName);
  }
  if (account.provider === "microsoft" && credentials.kind === "oauth") {
    const token = await oauthAccessToken(context, account, credentials);
    const event = await providerJson<MicrosoftEvent>(
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.provider_calendar_id)}/events/${encodeURIComponent(existing.provider_event_id)}`,
      {
        method: "PATCH",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(microsoftBody(input)),
      },
      "Microsoft could not update the event.",
    );
    return microsoftEvent(event, source.name, ownerName);
  }
  if (credentials.kind === "caldav" && existing.provider_url) {
    const response = await fetch(secureCalDavUrl(existing.provider_url), {
      method: "PUT",
      headers: {
        ...basicHeaders(credentials),
        "Content-Type": "text/calendar; charset=utf-8",
        ...(existing.provider_etag
          ? { "If-Match": existing.provider_etag }
          : {}),
      },
      body: calendarIcs(
        input,
        existing.provider_event_id.split(":", 1)[0],
        account.address,
      ),
    });
    if (!response.ok)
      throw new CalendarHttpError(502, "CalDAV could not update the event.");
    return {
      ...existing,
      source_name: source.name,
      owner_name: ownerName,
      title: input.title,
      description: input.description || "",
      location: input.location || "",
      starts_at: new Date(input.startsAt).toISOString(),
      ends_at: new Date(input.endsAt).toISOString(),
      all_day: Boolean(input.allDay),
      timezone: input.timezone || "UTC",
      attendees: (input.attendees ?? []) as CalendarPerson[],
      provider_etag: response.headers.get("etag") || existing.provider_etag,
    };
  }
  throw new CalendarHttpError(
    409,
    "Calendar credentials do not match the provider.",
  );
}

export async function deleteProviderEvent(
  context: CalendarRequestContext,
  account: CalendarAccountRow,
  credentials: CalendarCredentials,
  source: CalendarSourceRow,
  existing: CalendarEventRow,
) {
  if (account.sync_mode !== "two-way" || !source.can_write)
    throw new CalendarHttpError(403, "This calendar is read only.");
  if (
    (account.provider === "apple" || account.provider === "caldav") &&
    (existing.recurrence.length > 0 || existing.provider_event_id.includes(":"))
  ) {
    throw new CalendarHttpError(
      409,
      "Recurring CalDAV instances must be deleted in their source calendar.",
    );
  }
  let response: Response;
  if (account.provider === "google" && credentials.kind === "oauth") {
    const token = await oauthAccessToken(context, account, credentials);
    response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.provider_calendar_id)}/events/${encodeURIComponent(existing.provider_event_id)}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: oauthHeaders(
          token,
          existing.provider_etag ? { "If-Match": existing.provider_etag } : {},
        ),
      },
    );
  } else if (account.provider === "microsoft" && credentials.kind === "oauth") {
    const token = await oauthAccessToken(context, account, credentials);
    response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.provider_calendar_id)}/events/${encodeURIComponent(existing.provider_event_id)}`,
      { method: "DELETE", headers: oauthHeaders(token) },
    );
  } else if (credentials.kind === "caldav" && existing.provider_url) {
    response = await fetch(secureCalDavUrl(existing.provider_url), {
      method: "DELETE",
      headers: {
        ...basicHeaders(credentials),
        ...(existing.provider_etag
          ? { "If-Match": existing.provider_etag }
          : {}),
      },
    });
  } else {
    throw new CalendarHttpError(
      409,
      "Calendar credentials do not match the provider.",
    );
  }
  if (!response.ok && response.status !== 404) {
    throw new CalendarHttpError(
      502,
      "The provider could not delete the event.",
    );
  }
}

export function providerForOAuth(value: string): "google" | "microsoft" {
  if (value === "google" || value === "microsoft") return value;
  throw new CalendarHttpError(404, "Unknown calendar provider.");
}

export function isCalDavProvider(
  value: CalendarProvider,
): value is "apple" | "caldav" {
  return value === "apple" || value === "caldav";
}
