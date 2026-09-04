export const emailProviders = ["gmail", "outlook", "custom"] as const;
export type EmailProvider = (typeof emailProviders)[number];
export type EmailConnectionStatus =
  "connecting" | "active" | "syncing" | "error";

export type EmailAccount = {
  id: string;
  provider: EmailProvider;
  address: string;
  label: string;
  status: EmailConnectionStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  unreadCount: number;
};

export type EmailRecipient = {
  name?: string;
  address: string;
};

export type EmailAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

export type EmailMessage = {
  id: string;
  providerMessageId: string;
  providerThreadId: string | null;
  subject: string;
  senderName: string;
  senderAddress: string;
  recipients: EmailRecipient[];
  receivedAt: string;
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
};

export type EmailMessageDetail = EmailMessage & {
  text: string;
  attachments: EmailAttachment[];
};

export type EmailComposeAttachment = {
  name: string;
  contentType: string;
  contentBase64: string;
};

export type EmailComposeInput = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  replyToProviderMessageId?: string;
  attachments?: EmailComposeAttachment[];
};

export const emailProviderLabels: Record<EmailProvider, string> = {
  gmail: "Gmail / Google Workspace",
  outlook: "Outlook / Microsoft 365",
  custom: "Custom domain",
};

export function parseEmailAddressList(value: string) {
  return value
    .split(/[;,]/)
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

export function encodedAttachmentsBytes(
  attachments: Pick<EmailComposeAttachment, "contentBase64">[],
) {
  return attachments.reduce((sum, attachment) => {
    const padding = attachment.contentBase64.endsWith("==")
      ? 2
      : attachment.contentBase64.endsWith("=")
        ? 1
        : 0;
    return (
      sum + Math.floor((attachment.contentBase64.length * 3) / 4) - padding
    );
  }, 0);
}
