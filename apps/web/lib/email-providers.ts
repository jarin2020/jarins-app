import "server-only";

import { ImapFlow, type MessageStructureObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import type {
  EmailAttachment,
  EmailComposeInput,
  EmailMessageDetail,
  EmailRecipient,
} from "@/lib/email";
import type {
  CustomCredentials,
  EmailAccountRow,
  EmailCredentials,
  EmailRequestContext,
  OAuthCredentials,
} from "@/lib/email-server";
import { EmailHttpError, saveCredentials } from "@/lib/email-server";

export type SyncedEmail = {
  account_id: string;
  user_id: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  internet_message_id: string | null;
  subject: string;
  sender_name: string;
  sender_address: string;
  recipients: EmailRecipient[];
  received_at: string;
  snippet: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  provider_labels: string[];
};

type ProviderResult = {
  messages: SyncedEmail[];
  cursor?: string | null;
};

type ProviderAttachment = EmailAttachment & { content?: Uint8Array };

const GRAPH = "https://graph.microsoft.com/v1.0";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new EmailHttpError(503, `${name} is not configured.`);
  return value;
}

function safeProviderError(provider: string, response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new EmailHttpError(
      409,
      `${provider} authorization expired. Reconnect this mailbox.`,
    );
  }
  if (response.status === 429) {
    return new EmailHttpError(
      429,
      `${provider} is rate limiting sync. Try again soon.`,
    );
  }
  return new EmailHttpError(
    502,
    `${provider} returned an error (${response.status}).`,
  );
}

async function providerJson<T>(
  provider: string,
  url: string,
  init: RequestInit,
) {
  const response = await fetch(url, init);
  if (!response.ok) throw safeProviderError(provider, response);
  if (response.status === 204 || response.status === 202) return null as T;
  return (await response.json()) as T;
}

async function refreshOAuth(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: OAuthCredentials,
) {
  if (credentials.expiresAt > Date.now() + 60_000) return credentials;
  const google = account.provider === "gmail";
  const body = new URLSearchParams({
    client_id: requiredEnv(
      google ? "GOOGLE_EMAIL_CLIENT_ID" : "MICROSOFT_EMAIL_CLIENT_ID",
    ),
    client_secret: requiredEnv(
      google ? "GOOGLE_EMAIL_CLIENT_SECRET" : "MICROSOFT_EMAIL_CLIENT_SECRET",
    ),
    refresh_token: credentials.refreshToken,
    grant_type: "refresh_token",
  });
  if (!google) body.set("scope", credentials.scope);
  const response = await fetch(
    google
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    { method: "POST", body },
  );
  if (!response.ok)
    throw safeProviderError(google ? "Google" : "Microsoft", response);
  const token = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  const next: OAuthCredentials = {
    kind: "oauth",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? credentials.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? credentials.scope,
  };
  await saveCredentials(context, account.id, next);
  return next;
}

function bearer(token: string, extra?: HeadersInit): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function decodeUrlBase64(value?: string) {
  if (!value) return "";
  return Buffer.from(value, "base64url").toString("utf8");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddress(value = ""): EmailRecipient {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match)
    return { name: match[1].trim() || undefined, address: match[2].trim() };
  return { address: value.trim() };
}

function parseAddressList(value = "") {
  return value
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(parseAddress)
    .filter((recipient) => recipient.address.includes("@"));
}

type GmailHeader = { name: string; value: string };
type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

function gmailHeader(message: GmailMessage, name: string) {
  return (
    message.payload?.headers?.find(
      (header) => header.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function gmailParts(root?: GmailPart) {
  const result: GmailPart[] = [];
  const visit = (part?: GmailPart) => {
    if (!part) return;
    result.push(part);
    part.parts?.forEach(visit);
  };
  visit(root);
  return result;
}

function gmailDetail(message: GmailMessage): EmailMessageDetail {
  const parts = gmailParts(message.payload);
  const plain = parts.find(
    (part) => part.mimeType === "text/plain" && part.body?.data,
  );
  const html = parts.find(
    (part) => part.mimeType === "text/html" && part.body?.data,
  );
  const from = parseAddress(gmailHeader(message, "From"));
  return {
    id: message.id,
    providerMessageId: message.id,
    providerThreadId: message.threadId ?? null,
    subject: gmailHeader(message, "Subject") || "(No subject)",
    senderName: from.name ?? "",
    senderAddress: from.address,
    recipients: parseAddressList(gmailHeader(message, "To")),
    receivedAt: new Date(
      Number(message.internalDate ?? Date.now()),
    ).toISOString(),
    snippet: message.snippet ?? "",
    isRead: !message.labelIds?.includes("UNREAD"),
    isStarred: Boolean(message.labelIds?.includes("STARRED")),
    hasAttachments: parts.some((part) => Boolean(part.filename)),
    text: plain?.body?.data
      ? decodeUrlBase64(plain.body.data)
      : stripHtml(decodeUrlBase64(html?.body?.data)),
    attachments: parts
      .filter((part) => part.filename && part.body?.attachmentId)
      .map((part) => ({
        id: part.body!.attachmentId!,
        name: part.filename!,
        contentType: part.mimeType ?? "application/octet-stream",
        size: part.body?.size ?? 0,
      })),
  };
}

async function syncGmail(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: OAuthCredentials,
): Promise<ProviderResult> {
  const auth = await refreshOAuth(context, account, credentials);
  const list = await providerJson<{
    messages?: { id: string }[];
    historyId?: string;
  }>("Google", `${GMAIL}/messages?labelIds=INBOX&maxResults=50`, {
    headers: bearer(auth.accessToken),
  });
  const messages: SyncedEmail[] = [];
  for (const batchStart of Array.from(
    { length: Math.ceil((list.messages?.length ?? 0) / 8) },
    (_, index) => index * 8,
  )) {
    const batch = list.messages!.slice(batchStart, batchStart + 8);
    const detail = await Promise.all(
      batch.map(({ id }) => {
        const query = new URLSearchParams({ format: "metadata" });
        ["From", "To", "Cc", "Subject", "Date", "Message-ID"].forEach(
          (header) => query.append("metadataHeaders", header),
        );
        return providerJson<GmailMessage>(
          "Google",
          `${GMAIL}/messages/${encodeURIComponent(id)}?${query}`,
          { headers: bearer(auth.accessToken) },
        );
      }),
    );
    for (const message of detail) {
      const from = parseAddress(gmailHeader(message, "From"));
      messages.push({
        account_id: account.id,
        user_id: context.user.id,
        provider_message_id: message.id,
        provider_thread_id: message.threadId ?? null,
        internet_message_id: gmailHeader(message, "Message-ID") || null,
        subject: gmailHeader(message, "Subject") || "(No subject)",
        sender_name: from.name ?? "",
        sender_address: from.address,
        recipients: parseAddressList(gmailHeader(message, "To")),
        received_at: new Date(
          Number(message.internalDate ?? Date.now()),
        ).toISOString(),
        snippet: message.snippet ?? "",
        is_read: !message.labelIds?.includes("UNREAD"),
        is_starred: Boolean(message.labelIds?.includes("STARRED")),
        has_attachments: false,
        provider_labels: message.labelIds ?? [],
      });
    }
  }
  return { messages, cursor: list.historyId ?? null };
}

type GraphAddress = { emailAddress?: { name?: string; address?: string } };
type GraphMessage = {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  from?: GraphAddress;
  toRecipients?: GraphAddress[];
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  isRead?: boolean;
  flag?: { flagStatus?: string };
  hasAttachments?: boolean;
};

function graphRecipient(recipient?: GraphAddress): EmailRecipient {
  return {
    name: recipient?.emailAddress?.name || undefined,
    address: recipient?.emailAddress?.address ?? "",
  };
}

async function syncOutlook(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: OAuthCredentials,
): Promise<ProviderResult> {
  const auth = await refreshOAuth(context, account, credentials);
  const fields = [
    "id",
    "conversationId",
    "internetMessageId",
    "subject",
    "from",
    "toRecipients",
    "receivedDateTime",
    "bodyPreview",
    "isRead",
    "flag",
    "hasAttachments",
  ].join(",");
  const query = new URLSearchParams({
    $top: "50",
    $select: fields,
    $orderby: "receivedDateTime desc",
  });
  const list = await providerJson<{
    value: GraphMessage[];
    "@odata.deltaLink"?: string;
  }>("Microsoft", `${GRAPH}/me/mailFolders/inbox/messages?${query}`, {
    headers: bearer(auth.accessToken),
  });
  return {
    messages: list.value.map((message) => {
      const from = graphRecipient(message.from);
      return {
        account_id: account.id,
        user_id: context.user.id,
        provider_message_id: message.id,
        provider_thread_id: message.conversationId ?? null,
        internet_message_id: message.internetMessageId ?? null,
        subject: message.subject || "(No subject)",
        sender_name: from.name ?? "",
        sender_address: from.address,
        recipients: (message.toRecipients ?? []).map(graphRecipient),
        received_at: message.receivedDateTime ?? new Date().toISOString(),
        snippet: message.bodyPreview ?? "",
        is_read: Boolean(message.isRead),
        is_starred: message.flag?.flagStatus === "flagged",
        has_attachments: Boolean(message.hasAttachments),
        provider_labels: [],
      };
    }),
    cursor: list["@odata.deltaLink"] ?? null,
  };
}

function customClient(credentials: CustomCredentials) {
  return new ImapFlow({
    host: credentials.imap.host,
    port: credentials.imap.port,
    secure: credentials.imap.secure,
    doSTARTTLS: !credentials.imap.secure,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
    disableAutoIdle: true,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
  });
}

function hasAttachment(structure?: MessageStructureObject): boolean {
  if (!structure) return false;
  if (structure.disposition?.toLowerCase() === "attachment") return true;
  if (structure.dispositionParameters?.filename) return true;
  return Boolean(structure.childNodes?.some(hasAttachment));
}

export async function verifyCustomConnection(credentials: CustomCredentials) {
  const client = customClient(credentials);
  const smtp = nodemailer.createTransport({
    host: credentials.smtp.host,
    port: credentials.smtp.port,
    secure: credentials.smtp.secure,
    requireTLS: !credentials.smtp.secure,
    auth: { user: credentials.username, pass: credentials.password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  try {
    await Promise.all([
      (async () => {
        await client.connect();
        await client.mailboxOpen("INBOX", { readOnly: true });
      })(),
      smtp.verify(),
    ]);
  } finally {
    await Promise.allSettled([client.logout(), smtp.close()]);
  }
}

async function syncCustom(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: CustomCredentials,
): Promise<ProviderResult> {
  const client = customClient(credentials);
  await client.connect();
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  try {
    const total =
      client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0;
    if (!total) return { messages: [] };
    const start = Math.max(1, total - 49);
    const messages: SyncedEmail[] = [];
    for await (const message of client.fetch(`${start}:*`, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      bodyStructure: true,
    })) {
      const from = message.envelope?.from?.[0];
      messages.push({
        account_id: account.id,
        user_id: context.user.id,
        provider_message_id: String(message.uid),
        provider_thread_id: message.threadId ?? null,
        internet_message_id: message.envelope?.messageId ?? null,
        subject: message.envelope?.subject || "(No subject)",
        sender_name: from?.name ?? "",
        sender_address: from?.address ?? "",
        recipients: (message.envelope?.to ?? []).map((recipient) => ({
          name: recipient.name,
          address: recipient.address ?? "",
        })),
        received_at: new Date(
          message.internalDate ?? message.envelope?.date ?? Date.now(),
        ).toISOString(),
        snippet: "Open to load this message securely from the mail server.",
        is_read: Boolean(message.flags?.has("\\Seen")),
        is_starred: Boolean(message.flags?.has("\\Flagged")),
        has_attachments: hasAttachment(message.bodyStructure),
        provider_labels: [...(message.flags ?? [])],
      });
    }
    return { messages };
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function syncProvider(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: EmailCredentials,
) {
  if (account.provider === "gmail" && credentials.kind === "oauth") {
    return syncGmail(context, account, credentials);
  }
  if (account.provider === "outlook" && credentials.kind === "oauth") {
    return syncOutlook(context, account, credentials);
  }
  if (account.provider === "custom" && credentials.kind === "password") {
    return syncCustom(context, account, credentials);
  }
  throw new EmailHttpError(409, "The mailbox credential type is invalid.");
}

async function gmailFull(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: OAuthCredentials,
  messageId: string,
) {
  const auth = await refreshOAuth(context, account, credentials);
  return providerJson<GmailMessage>(
    "Google",
    `${GMAIL}/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: bearer(auth.accessToken) },
  );
}

export async function getProviderMessage(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: EmailCredentials,
  messageId: string,
): Promise<EmailMessageDetail> {
  if (account.provider === "gmail" && credentials.kind === "oauth") {
    return gmailDetail(
      await gmailFull(context, account, credentials, messageId),
    );
  }
  if (account.provider === "outlook" && credentials.kind === "oauth") {
    const auth = await refreshOAuth(context, account, credentials);
    const query = new URLSearchParams({
      $select:
        "id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,body,isRead,flag,hasAttachments",
    });
    const message = await providerJson<GraphMessage>(
      "Microsoft",
      `${GRAPH}/me/messages/${encodeURIComponent(messageId)}?${query}`,
      {
        headers: bearer(auth.accessToken, {
          Prefer: 'outlook.body-content-type="text"',
        }),
      },
    );
    const attachments = message.hasAttachments
      ? await providerJson<{
          value: {
            id: string;
            name: string;
            contentType: string;
            size: number;
            isInline?: boolean;
          }[];
        }>(
          "Microsoft",
          `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
          { headers: bearer(auth.accessToken) },
        )
      : { value: [] };
    const from = graphRecipient(message.from);
    return {
      id: message.id,
      providerMessageId: message.id,
      providerThreadId: message.conversationId ?? null,
      subject: message.subject || "(No subject)",
      senderName: from.name ?? "",
      senderAddress: from.address,
      recipients: (message.toRecipients ?? []).map(graphRecipient),
      receivedAt: message.receivedDateTime ?? new Date().toISOString(),
      snippet: message.bodyPreview ?? "",
      isRead: Boolean(message.isRead),
      isStarred: message.flag?.flagStatus === "flagged",
      hasAttachments: Boolean(message.hasAttachments),
      text:
        message.body?.contentType?.toLowerCase() === "html"
          ? stripHtml(message.body.content ?? "")
          : (message.body?.content ?? ""),
      attachments: attachments.value
        .filter((attachment) => !attachment.isInline)
        .map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
        })),
    };
  }
  if (account.provider === "custom" && credentials.kind === "password") {
    const client = customClient(credentials);
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const fetched = await client.fetchOne(
        messageId,
        { uid: true, source: true },
        { uid: true },
      );
      if (!fetched || !fetched.source)
        throw new EmailHttpError(404, "Message not found.");
      const mail = await simpleParser(fetched.source);
      const from = mail.from?.value[0];
      return {
        id: messageId,
        providerMessageId: messageId,
        providerThreadId: null,
        subject: mail.subject || "(No subject)",
        senderName: from?.name ?? "",
        senderAddress: from?.address ?? "",
        recipients: mail.to
          ? (Array.isArray(mail.to) ? mail.to : [mail.to]).flatMap((address) =>
              address.value.map((value) => ({
                name: value.name,
                address: value.address ?? "",
              })),
            )
          : [],
        receivedAt: (mail.date ?? new Date()).toISOString(),
        snippet: (mail.text ?? "").slice(0, 240),
        isRead: true,
        isStarred: false,
        hasAttachments: mail.attachments.length > 0,
        text:
          mail.text ??
          stripHtml(typeof mail.html === "string" ? mail.html : ""),
        attachments: mail.attachments.map((attachment, index) => ({
          id: String(index),
          name: attachment.filename ?? `attachment-${index + 1}`,
          contentType: attachment.contentType,
          size: attachment.size,
        })),
      };
    } finally {
      lock.release();
      await client.logout();
    }
  }
  throw new EmailHttpError(409, "The mailbox credential type is invalid.");
}

export type EmailAction = "read" | "unread" | "star" | "unstar" | "archive";

export async function applyProviderAction(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: EmailCredentials,
  messageId: string,
  action: EmailAction,
) {
  if (account.provider === "gmail" && credentials.kind === "oauth") {
    const auth = await refreshOAuth(context, account, credentials);
    const addLabelIds =
      action === "unread" ? ["UNREAD"] : action === "star" ? ["STARRED"] : [];
    const removeLabelIds =
      action === "read"
        ? ["UNREAD"]
        : action === "unstar"
          ? ["STARRED"]
          : action === "archive"
            ? ["INBOX"]
            : [];
    await providerJson(
      "Google",
      `${GMAIL}/messages/${encodeURIComponent(messageId)}/modify`,
      {
        method: "POST",
        headers: bearer(auth.accessToken, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
      },
    );
    return;
  }
  if (account.provider === "outlook" && credentials.kind === "oauth") {
    const auth = await refreshOAuth(context, account, credentials);
    if (action === "archive") {
      await providerJson(
        "Microsoft",
        `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/move`,
        {
          method: "POST",
          headers: bearer(auth.accessToken, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ destinationId: "archive" }),
        },
      );
    } else {
      const body =
        action === "read" || action === "unread"
          ? { isRead: action === "read" }
          : {
              flag: {
                flagStatus: action === "star" ? "flagged" : "notFlagged",
              },
            };
      await providerJson(
        "Microsoft",
        `${GRAPH}/me/messages/${encodeURIComponent(messageId)}`,
        {
          method: "PATCH",
          headers: bearer(auth.accessToken, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(body),
        },
      );
    }
    return;
  }
  if (account.provider === "custom" && credentials.kind === "password") {
    const client = customClient(credentials);
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      if (action === "read")
        await client.messageFlagsAdd(messageId, ["\\Seen"], { uid: true });
      if (action === "unread")
        await client.messageFlagsRemove(messageId, ["\\Seen"], { uid: true });
      if (action === "star")
        await client.messageFlagsAdd(messageId, ["\\Flagged"], { uid: true });
      if (action === "unstar")
        await client.messageFlagsRemove(messageId, ["\\Flagged"], {
          uid: true,
        });
      if (action === "archive") {
        try {
          await client.messageMove(messageId, "Archive", { uid: true });
        } catch {
          await client.messageMove(messageId, "INBOX.Archive", { uid: true });
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }
    return;
  }
  throw new EmailHttpError(409, "The mailbox credential type is invalid.");
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function wrapBase64(value: Uint8Array | string) {
  const encoded =
    typeof value === "string"
      ? Buffer.from(value, "utf8").toString("base64")
      : Buffer.from(value).toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function gmailMime(account: EmailAccountRow, input: EmailComposeInput) {
  const boundary = `jarins_${crypto.randomUUID().replaceAll("-", "")}`;
  const headers = [
    `From: ${cleanHeader(account.address)}`,
    `To: ${input.to.map(cleanHeader).join(", ")}`,
    ...(input.cc?.length
      ? [`Cc: ${input.cc.map(cleanHeader).join(", ")}`]
      : []),
    `Subject: =?UTF-8?B?${Buffer.from(cleanHeader(input.subject)).toString("base64")}?=`,
    "MIME-Version: 1.0",
  ];
  if (!input.attachments?.length) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(input.text),
    ].join("\r\n");
  }
  const body = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.text),
  ];
  for (const attachment of input.attachments) {
    body.push(
      `--${boundary}`,
      `Content-Type: ${cleanHeader(attachment.contentType)}; name="${cleanHeader(attachment.name)}"`,
      `Content-Disposition: attachment; filename="${cleanHeader(attachment.name)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(attachment.contentBase64, "base64")),
    );
  }
  body.push(`--${boundary}--`, "");
  return body.join("\r\n");
}

export async function sendProviderMessage(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: EmailCredentials,
  input: EmailComposeInput,
) {
  if (account.provider === "gmail" && credentials.kind === "oauth") {
    const auth = await refreshOAuth(context, account, credentials);
    await providerJson("Google", `${GMAIL}/messages/send`, {
      method: "POST",
      headers: bearer(auth.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        raw: Buffer.from(gmailMime(account, input)).toString("base64url"),
      }),
    });
    return;
  }
  if (account.provider === "outlook" && credentials.kind === "oauth") {
    const auth = await refreshOAuth(context, account, credentials);
    await providerJson("Microsoft", `${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: bearer(auth.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: "Text", content: input.text },
          toRecipients: input.to.map((address) => ({
            emailAddress: { address },
          })),
          ccRecipients: (input.cc ?? []).map((address) => ({
            emailAddress: { address },
          })),
          attachments: (input.attachments ?? []).map((attachment) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: attachment.name,
            contentType: attachment.contentType,
            contentBytes: attachment.contentBase64,
          })),
        },
      }),
    });
    return;
  }
  if (account.provider === "custom" && credentials.kind === "password") {
    const smtp = nodemailer.createTransport({
      host: credentials.smtp.host,
      port: credentials.smtp.port,
      secure: credentials.smtp.secure,
      requireTLS: !credentials.smtp.secure,
      auth: { user: credentials.username, pass: credentials.password },
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
    try {
      await smtp.sendMail({
        from: account.address,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        text: input.text,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.name,
          contentType: attachment.contentType,
          content: Buffer.from(attachment.contentBase64, "base64"),
        })),
      });
    } finally {
      smtp.close();
    }
    return;
  }
  throw new EmailHttpError(409, "The mailbox credential type is invalid.");
}

export async function downloadProviderAttachment(
  context: EmailRequestContext,
  account: EmailAccountRow,
  credentials: EmailCredentials,
  messageId: string,
  attachmentId: string,
): Promise<ProviderAttachment> {
  if (account.provider === "gmail" && credentials.kind === "oauth") {
    const message = await gmailFull(context, account, credentials, messageId);
    const part = gmailParts(message.payload).find(
      (candidate) => candidate.body?.attachmentId === attachmentId,
    );
    if (!part) throw new EmailHttpError(404, "Attachment not found.");
    const auth = await refreshOAuth(context, account, credentials);
    const payload = await providerJson<{ data: string; size: number }>(
      "Google",
      `${GMAIL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: bearer(auth.accessToken) },
    );
    return {
      id: attachmentId,
      name: part.filename || "attachment",
      contentType: part.mimeType ?? "application/octet-stream",
      size: payload.size,
      content: new Uint8Array(Buffer.from(payload.data, "base64url")),
    };
  }
  if (account.provider === "outlook" && credentials.kind === "oauth") {
    const auth = await refreshOAuth(context, account, credentials);
    const attachment = await providerJson<{
      id: string;
      name: string;
      contentType: string;
      size: number;
      contentBytes?: string;
    }>(
      "Microsoft",
      `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: bearer(auth.accessToken) },
    );
    if (!attachment.contentBytes) {
      throw new EmailHttpError(
        409,
        "This Microsoft attachment type cannot be downloaded here.",
      );
    }
    return {
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      content: new Uint8Array(Buffer.from(attachment.contentBytes, "base64")),
    };
  }
  if (account.provider === "custom" && credentials.kind === "password") {
    const client = customClient(credentials);
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const fetched = await client.fetchOne(
        messageId,
        { source: true },
        { uid: true },
      );
      if (!fetched || !fetched.source)
        throw new EmailHttpError(404, "Message not found.");
      const mail = await simpleParser(fetched.source);
      const attachment = mail.attachments[Number(attachmentId)];
      if (!attachment) throw new EmailHttpError(404, "Attachment not found.");
      return {
        id: attachmentId,
        name: attachment.filename ?? "attachment",
        contentType: attachment.contentType,
        size: attachment.size,
        content: new Uint8Array(attachment.content),
      };
    } finally {
      lock.release();
      await client.logout();
    }
  }
  throw new EmailHttpError(409, "The mailbox credential type is invalid.");
}
