import "server-only";

import {
  dropboxStorageClientId,
  dropboxStorageClientSecret,
  googleStorageClientId,
  googleStorageClientSecret,
  microsoftStorageClientId,
  microsoftStorageClientSecret,
  saveStorageCredentials,
  StorageHttpError,
  type StorageAccountRow,
  type StorageCredentials,
  type StorageItemRow,
  type StorageOAuthCredentials,
  type StorageRequestContext,
  type WebDavCredentials,
} from "@/lib/storage-server";

export type ProviderStorageItem = Omit<
  StorageItemRow,
  "id" | "account_id" | "user_id"
>;

export type StorageSyncResult = {
  items: ProviderStorageItem[];
  rootProviderItemId: string;
  cursor: string | null;
};

type GoogleFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
  md5Checksum?: string;
  capabilities?: { canDownload?: boolean; canEdit?: boolean };
};

type GoogleSharedDrive = {
  id: string;
  name: string;
};

type MicrosoftDriveItem = {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  eTag?: string;
  lastModifiedDateTime?: string;
  parentReference?: { id?: string; path?: string };
  folder?: Record<string, unknown>;
  file?: { mimeType?: string; hashes?: { quickXorHash?: string } };
  deleted?: Record<string, unknown>;
};

type DropboxEntry = {
  ".tag": "file" | "folder" | "deleted";
  id?: string;
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  server_modified?: string;
  content_hash?: string;
  rev?: string;
  sharing_info?: { read_only?: boolean };
};

const googleFolderMime = "application/vnd.google-apps.folder";
const maximumIndexedItems = 10_000;

async function checkedJson<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) {
    throw new StorageHttpError(response.status === 401 ? 409 : 502, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function oauthHeaders(token: string, extra?: HeadersInit) {
  return new Headers({ Authorization: `Bearer ${token}`, ...extra });
}

async function oauthAccessToken(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageOAuthCredentials,
) {
  if (credentials.expiresAt > Date.now() + 60_000)
    return credentials.accessToken;

  let url: string;
  let body: URLSearchParams;
  if (account.provider === "google-drive") {
    url = "https://oauth2.googleapis.com/token";
    body = new URLSearchParams({
      client_id: googleStorageClientId(),
      client_secret: googleStorageClientSecret(),
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    });
  } else if (account.provider === "onedrive") {
    url = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    body = new URLSearchParams({
      client_id: microsoftStorageClientId(),
      client_secret: microsoftStorageClientSecret(),
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
      scope: credentials.scope,
    });
  } else if (account.provider === "dropbox") {
    url = "https://api.dropboxapi.com/oauth2/token";
    body = new URLSearchParams({
      client_id: dropboxStorageClientId(),
      client_secret: dropboxStorageClientSecret(),
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    });
  } else {
    throw new StorageHttpError(409, "Storage OAuth credentials are invalid.");
  }

  const token = await checkedJson<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>(
    await fetch(url, { method: "POST", body }),
    "The storage authorization expired. Reconnect this account.",
  );
  const next: StorageOAuthCredentials = {
    kind: "oauth",
    accessToken: token.access_token,
    refreshToken: token.refresh_token || credentials.refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 14_400) * 1000,
    scope: token.scope || credentials.scope,
  };
  await saveStorageCredentials(context, account.id, next);
  Object.assign(credentials, next);
  return next.accessToken;
}

function requireOAuth(credentials: StorageCredentials) {
  if (credentials.kind !== "oauth")
    throw new StorageHttpError(409, "Storage credentials are invalid.");
  return credentials;
}

export function secureWebDavUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StorageHttpError(400, "Enter a valid WebDAV server URL.");
  }
  if (url.protocol !== "https:")
    throw new StorageHttpError(400, "WebDAV connections must use HTTPS.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^\d+$/.test(host) ||
    /^\d+(\.\d+){3}$/.test(host) ||
    host.includes(":") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      host,
    ) ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    throw new StorageHttpError(
      400,
      "Private-network WebDAV servers are not supported.",
    );
  }
  url.username = "";
  url.password = "";
  return url;
}

function ensureWebDavItemUrl(credentials: WebDavCredentials, value: string) {
  const root = secureWebDavUrl(credentials.serverUrl);
  const target = secureWebDavUrl(value);
  const rootPath = root.pathname.endsWith("/")
    ? root.pathname
    : `${root.pathname}/`;
  if (
    target.origin !== root.origin ||
    (target.pathname !== root.pathname && !target.pathname.startsWith(rootPath))
  ) {
    throw new StorageHttpError(400, "The WebDAV item is outside this account.");
  }
  return target;
}

function webDavHeaders(credentials: WebDavCredentials, extra?: HeadersInit) {
  return new Headers({
    Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
    ...extra,
  });
}

async function readLimitedText(response: Response, maximum = 8 * 1024 * 1024) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximum)
    throw new StorageHttpError(
      413,
      "The WebDAV directory listing is too large.",
    );
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new StorageHttpError(
        413,
        "The WebDAV directory listing is too large.",
      );
    }
    chunks.push(result.value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function webDavRequest(
  credentials: WebDavCredentials,
  value: string,
  init: RequestInit,
) {
  let target = ensureWebDavItemUrl(credentials, value);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(target, {
      ...init,
      headers: webDavHeaders(credentials, init.headers),
      redirect: "manual",
    });
    if (![301, 302, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 5)
      throw new StorageHttpError(
        502,
        "The WebDAV server redirected too many times.",
      );
    target = ensureWebDavItemUrl(credentials, new URL(location, target).href);
  }
  throw new StorageHttpError(502, "The WebDAV server did not respond.");
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function xmlValue(xml: string, localName: string) {
  const match = xml.match(
    new RegExp(
      `<[^>]*:?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/[^>]*:?${localName}>`,
      "i",
    ),
  );
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : null;
}

function finiteNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function validDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function webDavResponses(xml: string) {
  return [
    ...xml.matchAll(
      /<[^>]*:?response(?:\s[^>]*)?>([\s\S]*?)<\/[^>]*:?response>/gi,
    ),
  ].map((match) => match[1]);
}

function webDavParentUrl(root: URL, target: URL) {
  if (target.pathname === root.pathname) return null;
  const path = target.pathname.replace(/\/$/, "");
  const parent = new URL(target);
  parent.pathname = `${path.slice(0, path.lastIndexOf("/") + 1)}`;
  return parent.href;
}

function relativeWebDavPath(root: URL, target: URL) {
  const rootPath = root.pathname.endsWith("/")
    ? root.pathname
    : `${root.pathname}/`;
  const relative = target.pathname.startsWith(rootPath)
    ? target.pathname.slice(rootPath.length)
    : "";
  try {
    return decodeURIComponent(relative).replace(/\/$/, "");
  } catch {
    return relative.replace(/\/$/, "");
  }
}

const webDavPropfindBody =
  '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontenttype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop></d:propfind>';

async function webDavPropfind(
  credentials: WebDavCredentials,
  url: string,
  depth: "1" | "infinity",
) {
  return webDavRequest(credentials, url, {
    method: "PROPFIND",
    headers: {
      Depth: depth,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: webDavPropfindBody,
  });
}

function webDavItemsFromXml(
  account: StorageAccountRow,
  credentials: WebDavCredentials,
  root: URL,
  xml: string,
) {
  const items: ProviderStorageItem[] = [];
  for (const entry of webDavResponses(xml)) {
    const href = xmlValue(entry, "href");
    if (!href) continue;
    const target = ensureWebDavItemUrl(credentials, new URL(href, root).href);
    if (target.pathname.replace(/\/$/, "") === root.pathname.replace(/\/$/, ""))
      continue;
    const folder = /<[^>]*:?collection(?:\s|\/|>)/i.test(entry);
    const path = relativeWebDavPath(root, target);
    const fallbackName = path.split("/").pop() || "Untitled";
    items.push({
      provider_item_id: target.href,
      parent_provider_item_id: webDavParentUrl(root, target),
      path,
      name: xmlValue(entry, "displayname") || fallbackName,
      item_kind: folder ? "folder" : "file",
      mime_type: folder ? null : xmlValue(entry, "getcontenttype"),
      size_bytes: folder
        ? null
        : finiteNumber(xmlValue(entry, "getcontentlength")),
      modified_at: validDate(xmlValue(entry, "getlastmodified")),
      web_url: target.href,
      provider_etag: xmlValue(entry, "getetag"),
      content_hash: null,
      can_download: !folder,
      can_edit: account.access_mode === "manage",
    });
  }
  return items;
}

async function syncGoogleDrive(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageOAuthCredentials,
): Promise<StorageSyncResult> {
  const token = await oauthAccessToken(context, account, credentials);
  const root = await checkedJson<{ id: string }>(
    await fetch("https://www.googleapis.com/drive/v3/files/root?fields=id", {
      headers: oauthHeaders(token),
    }),
    "Google Drive root could not be loaded.",
  );
  const items: ProviderStorageItem[] = [];
  let drivePageToken = "";
  do {
    const driveQuery = new URLSearchParams({
      pageSize: "100",
      fields: "nextPageToken,drives(id,name)",
    });
    if (drivePageToken) driveQuery.set("pageToken", drivePageToken);
    const drivePayload = await checkedJson<{
      drives?: GoogleSharedDrive[];
      nextPageToken?: string;
    }>(
      await fetch(`https://www.googleapis.com/drive/v3/drives?${driveQuery}`, {
        headers: oauthHeaders(token),
      }),
      "Google shared drives could not be loaded.",
    );
    for (const drive of drivePayload.drives ?? []) {
      items.push({
        provider_item_id: drive.id,
        parent_provider_item_id: root.id,
        path: drive.name,
        name: drive.name,
        item_kind: "folder",
        mime_type: googleFolderMime,
        size_bytes: null,
        modified_at: null,
        web_url: `https://drive.google.com/drive/folders/${encodeURIComponent(drive.id)}`,
        provider_etag: null,
        content_hash: null,
        can_download: false,
        can_edit: account.access_mode === "manage",
      });
    }
    drivePageToken = drivePayload.nextPageToken || "";
  } while (drivePageToken && items.length < maximumIndexedItems);
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      q: "trashed = false",
      spaces: "drive",
      pageSize: "1000",
      fields:
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink,md5Checksum,capabilities(canDownload,canEdit))",
    });
    query.set("supportsAllDrives", "true");
    query.set("includeItemsFromAllDrives", "true");
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await checkedJson<{
      files?: GoogleFile[];
      nextPageToken?: string;
    }>(
      await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, {
        headers: oauthHeaders(token),
      }),
      "Google Drive files could not be loaded.",
    );
    for (const file of payload.files ?? []) {
      items.push({
        provider_item_id: file.id,
        parent_provider_item_id: file.parents?.[0] || root.id,
        path: file.name,
        name: file.name,
        item_kind: file.mimeType === googleFolderMime ? "folder" : "file",
        mime_type: file.mimeType,
        size_bytes: file.size ? Number(file.size) : null,
        modified_at: file.modifiedTime || null,
        web_url: file.webViewLink || null,
        provider_etag: null,
        content_hash: file.md5Checksum || null,
        can_download: file.capabilities?.canDownload !== false,
        can_edit:
          account.access_mode === "manage" &&
          file.capabilities?.canEdit !== false,
      });
      if (items.length >= maximumIndexedItems) break;
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken && items.length < maximumIndexedItems);
  return { items, rootProviderItemId: root.id, cursor: null };
}

async function syncOneDrive(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageOAuthCredentials,
): Promise<StorageSyncResult> {
  const token = await oauthAccessToken(context, account, credentials);
  const root = await checkedJson<{ id: string }>(
    await fetch("https://graph.microsoft.com/v1.0/me/drive/root?$select=id", {
      headers: oauthHeaders(token),
    }),
    "OneDrive root could not be loaded.",
  );
  const items: ProviderStorageItem[] = [];
  let url =
    "https://graph.microsoft.com/v1.0/me/drive/root/delta?$select=id,name,size,webUrl,eTag,lastModifiedDateTime,parentReference,folder,file,deleted&$top=200";
  let cursor: string | null = null;
  while (url && items.length < maximumIndexedItems) {
    const payload = await checkedJson<{
      value?: MicrosoftDriveItem[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(
      await fetch(url, { headers: oauthHeaders(token) }),
      "OneDrive files could not be loaded.",
    );
    for (const item of payload.value ?? []) {
      if (item.id === root.id || item.deleted) continue;
      const parentPath =
        (item.parentReference?.path || "").split("root:").pop() || "";
      items.push({
        provider_item_id: item.id,
        parent_provider_item_id: item.parentReference?.id || root.id,
        path: `${parentPath}/${item.name}`.replace(/^\/+/, ""),
        name: item.name,
        item_kind: item.folder ? "folder" : "file",
        mime_type: item.file?.mimeType || null,
        size_bytes: item.folder ? null : (item.size ?? null),
        modified_at: item.lastModifiedDateTime || null,
        web_url: item.webUrl || null,
        provider_etag: item.eTag || null,
        content_hash: item.file?.hashes?.quickXorHash || null,
        can_download: !item.folder,
        can_edit: account.access_mode === "manage",
      });
      if (items.length >= maximumIndexedItems) break;
    }
    const next = payload["@odata.nextLink"] || "";
    url = next.startsWith("https://graph.microsoft.com/") ? next : "";
    cursor = payload["@odata.deltaLink"] || cursor;
  }
  return { items, rootProviderItemId: root.id, cursor };
}

async function syncDropbox(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageOAuthCredentials,
): Promise<StorageSyncResult> {
  const token = await oauthAccessToken(context, account, credentials);
  const items: ProviderStorageItem[] = [];
  let response = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: oauthHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      path: "",
      recursive: true,
      include_deleted: false,
      include_non_downloadable_files: true,
      limit: 2000,
    }),
  });
  let cursor: string | null = null;
  while (true) {
    const payload = await checkedJson<{
      entries: DropboxEntry[];
      cursor: string;
      has_more: boolean;
    }>(response, "Dropbox files could not be loaded.");
    cursor = payload.cursor;
    for (const entry of payload.entries) {
      if (entry[".tag"] === "deleted" || !entry.id) continue;
      const path = entry.path_display || entry.name;
      const parentPath = path.slice(0, path.lastIndexOf("/")) || "";
      items.push({
        provider_item_id: path,
        parent_provider_item_id: parentPath,
        path: path.replace(/^\//, ""),
        name: entry.name,
        item_kind: entry[".tag"],
        mime_type: null,
        size_bytes: entry[".tag"] === "file" ? (entry.size ?? null) : null,
        modified_at: entry.server_modified || null,
        web_url: `https://www.dropbox.com/home${encodeURI(parentPath)}`,
        provider_etag: entry.rev || null,
        content_hash: entry.content_hash || null,
        can_download: entry[".tag"] === "file",
        can_edit:
          account.access_mode === "manage" &&
          entry.sharing_info?.read_only !== true,
      });
      if (items.length >= maximumIndexedItems) break;
    }
    if (!payload.has_more || items.length >= maximumIndexedItems) break;
    response = await fetch(
      "https://api.dropboxapi.com/2/files/list_folder/continue",
      {
        method: "POST",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ cursor }),
      },
    );
  }
  return { items, rootProviderItemId: "", cursor };
}

async function syncWebDav(
  account: StorageAccountRow,
  credentials: WebDavCredentials,
): Promise<StorageSyncResult> {
  const root = secureWebDavUrl(credentials.serverUrl);
  if (!root.pathname.endsWith("/")) root.pathname += "/";
  const response = await webDavPropfind(credentials, root.href, "infinity");
  if (response.ok || response.status === 207) {
    const items = webDavItemsFromXml(
      account,
      credentials,
      root,
      await readLimitedText(response),
    ).slice(0, maximumIndexedItems);
    return { items, rootProviderItemId: root.href, cursor: null };
  }
  if (response.status === 401) {
    throw new StorageHttpError(
      409,
      "WebDAV sign-in failed. Check the username and app password.",
    );
  }
  if (![400, 403, 405, 409, 507].includes(response.status)) {
    throw new StorageHttpError(
      502,
      "The WebDAV server could not list this folder.",
    );
  }

  // RFC 4918 permits servers to reject Depth: infinity. Fall back to bounded
  // breadth-first Depth: 1 discovery, which works with Nextcloud and ownCloud.
  const discovered = new Map<string, ProviderStorageItem>();
  const pending = [root.href];
  const visited = new Set<string>();
  while (
    pending.length &&
    visited.size < 40 &&
    discovered.size < maximumIndexedItems
  ) {
    const folderUrl = pending.shift()!;
    if (visited.has(folderUrl)) continue;
    visited.add(folderUrl);
    const listing = await webDavPropfind(credentials, folderUrl, "1");
    if (!listing.ok && listing.status !== 207) {
      throw new StorageHttpError(
        listing.status === 401 || listing.status === 403 ? 409 : 502,
        listing.status === 401 || listing.status === 403
          ? "WebDAV sign-in or folder access failed. Check the account permissions."
          : "The WebDAV server could not list this folder.",
      );
    }
    const children = webDavItemsFromXml(
      account,
      credentials,
      root,
      await readLimitedText(listing),
    );
    for (const item of children) {
      discovered.set(item.provider_item_id, item);
      if (item.item_kind === "folder" && !visited.has(item.provider_item_id))
        pending.push(item.provider_item_id);
      if (discovered.size >= maximumIndexedItems) break;
    }
  }
  if (pending.length) {
    throw new StorageHttpError(
      413,
      "This WebDAV account has too many folders for one safe synchronization. Connect a narrower folder URL.",
    );
  }
  return {
    items: [...discovered.values()],
    rootProviderItemId: root.href,
    cursor: null,
  };
}

export async function syncStorageProvider(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageCredentials,
) {
  if (account.provider === "google-drive")
    return syncGoogleDrive(context, account, requireOAuth(credentials));
  if (account.provider === "onedrive")
    return syncOneDrive(context, account, requireOAuth(credentials));
  if (account.provider === "dropbox")
    return syncDropbox(context, account, requireOAuth(credentials));
  if (credentials.kind !== "webdav")
    throw new StorageHttpError(409, "WebDAV credentials are invalid.");
  return syncWebDav(account, credentials);
}

function joinProviderPath(parent: string, name: string) {
  const cleanName = name.replaceAll("/", "-").trim();
  return `${parent.replace(/\/$/, "")}/${cleanName}`;
}

async function providerToken(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageCredentials,
) {
  return oauthAccessToken(context, account, requireOAuth(credentials));
}

export async function createProviderFolder(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageCredentials,
  parentProviderItemId: string,
  parentPath: string,
  name: string,
) {
  if (account.provider === "google-drive") {
    const token = await providerToken(context, account, credentials);
    await checkedJson<GoogleFile>(
      await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          name,
          mimeType: googleFolderMime,
          parents: [parentProviderItemId],
        }),
      }),
      "Google Drive could not create the folder.",
    );
  } else if (account.provider === "onedrive") {
    const token = await providerToken(context, account, credentials);
    await checkedJson<MicrosoftDriveItem>(
      await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentProviderItemId)}/children`,
        {
          method: "POST",
          headers: oauthHeaders(token, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            name,
            folder: {},
            "@microsoft.graph.conflictBehavior": "rename",
          }),
        },
      ),
      "OneDrive could not create the folder.",
    );
  } else if (account.provider === "dropbox") {
    const token = await providerToken(context, account, credentials);
    await checkedJson<unknown>(
      await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          path: joinProviderPath(parentPath, name),
          autorename: true,
        }),
      }),
      "Dropbox could not create the folder.",
    );
  } else {
    if (credentials.kind !== "webdav")
      throw new StorageHttpError(409, "WebDAV credentials are invalid.");
    const target = new URL(parentProviderItemId);
    if (!target.pathname.endsWith("/")) target.pathname += "/";
    target.pathname += `${encodeURIComponent(name)}/`;
    const response = await webDavRequest(credentials, target.href, {
      method: "MKCOL",
    });
    if (!response.ok)
      throw new StorageHttpError(502, "WebDAV could not create the folder.");
  }
}

export async function renameProviderItem(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageCredentials,
  item: StorageItemRow,
  name: string,
) {
  if (account.provider === "google-drive") {
    const token = await providerToken(context, account, credentials);
    await checkedJson<GoogleFile>(
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.provider_item_id)}?fields=id`,
        {
          method: "PATCH",
          headers: oauthHeaders(token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ name }),
        },
      ),
      "Google Drive could not rename the item.",
    );
  } else if (account.provider === "onedrive") {
    const token = await providerToken(context, account, credentials);
    await checkedJson<MicrosoftDriveItem>(
      await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item.provider_item_id)}`,
        {
          method: "PATCH",
          headers: oauthHeaders(token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ name }),
        },
      ),
      "OneDrive could not rename the item.",
    );
  } else if (account.provider === "dropbox") {
    const token = await providerToken(context, account, credentials);
    const parentPath = item.path.slice(0, item.path.lastIndexOf("/"));
    await checkedJson<unknown>(
      await fetch("https://api.dropboxapi.com/2/files/move_v2", {
        method: "POST",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          from_path: `/${item.path}`,
          to_path: joinProviderPath(parentPath, name),
          autorename: false,
        }),
      }),
      "Dropbox could not rename the item.",
    );
  } else {
    if (credentials.kind !== "webdav")
      throw new StorageHttpError(409, "WebDAV credentials are invalid.");
    const source = ensureWebDavItemUrl(credentials, item.provider_item_id);
    const destination = new URL(source);
    const path = source.pathname.replace(/\/$/, "");
    destination.pathname = `${path.slice(0, path.lastIndexOf("/") + 1)}${encodeURIComponent(name)}${item.item_kind === "folder" ? "/" : ""}`;
    const response = await webDavRequest(credentials, source.href, {
      method: "MOVE",
      headers: { Destination: destination.href, Overwrite: "F" },
    });
    if (!response.ok)
      throw new StorageHttpError(502, "WebDAV could not rename the item.");
  }
}

export async function deleteProviderItem(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageCredentials,
  item: StorageItemRow,
) {
  if (account.provider === "google-drive") {
    const token = await providerToken(context, account, credentials);
    await checkedJson<GoogleFile>(
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.provider_item_id)}?fields=id`,
        {
          method: "PATCH",
          headers: oauthHeaders(token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ trashed: true }),
        },
      ),
      "Google Drive could not move the item to trash.",
    );
  } else if (account.provider === "onedrive") {
    const token = await providerToken(context, account, credentials);
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item.provider_item_id)}`,
      { method: "DELETE", headers: oauthHeaders(token) },
    );
    if (!response.ok)
      throw new StorageHttpError(
        502,
        "OneDrive could not move the item to recycle bin.",
      );
  } else if (account.provider === "dropbox") {
    const token = await providerToken(context, account, credentials);
    await checkedJson<unknown>(
      await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
        method: "POST",
        headers: oauthHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ path: `/${item.path}` }),
      }),
      "Dropbox could not remove the item.",
    );
  } else {
    if (credentials.kind !== "webdav")
      throw new StorageHttpError(409, "WebDAV credentials are invalid.");
    const response = await webDavRequest(credentials, item.provider_item_id, {
      method: "DELETE",
    });
    if (!response.ok)
      throw new StorageHttpError(502, "WebDAV could not remove the item.");
  }
}

type StreamingRequestInit = RequestInit & { duplex: "half" };

export async function uploadProviderFile(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageCredentials,
  parentProviderItemId: string,
  parentPath: string,
  name: string,
  mimeType: string,
  contentLength: number,
  body: ReadableStream<Uint8Array> | null,
) {
  const uploadBody = body || new Uint8Array();
  if (account.provider === "google-drive") {
    const token = await providerToken(context, account, credentials);
    const session = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
      {
        method: "POST",
        headers: oauthHeaders(token, {
          "Content-Type": "application/json; charset=utf-8",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(contentLength),
        }),
        body: JSON.stringify({ name, parents: [parentProviderItemId] }),
      },
    );
    const location = session.headers.get("location");
    if (!session.ok || !location)
      throw new StorageHttpError(
        502,
        "Google Drive could not start the upload.",
      );
    const init: StreamingRequestInit = {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(contentLength),
      },
      body: uploadBody,
      duplex: "half",
    };
    await checkedJson<GoogleFile>(
      await fetch(location, init),
      "Google Drive could not upload the file.",
    );
  } else if (account.provider === "onedrive") {
    const token = await providerToken(context, account, credentials);
    const init: StreamingRequestInit = {
      method: "PUT",
      headers: oauthHeaders(token, {
        "Content-Type": mimeType,
        "Content-Length": String(contentLength),
      }),
      body: uploadBody,
      duplex: "half",
    };
    await checkedJson<MicrosoftDriveItem>(
      await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentProviderItemId)}:/${encodeURIComponent(name)}:/content`,
        init,
      ),
      "OneDrive could not upload the file.",
    );
  } else if (account.provider === "dropbox") {
    const token = await providerToken(context, account, credentials);
    const init: StreamingRequestInit = {
      method: "POST",
      headers: oauthHeaders(token, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(contentLength),
        "Dropbox-API-Arg": JSON.stringify({
          path: joinProviderPath(parentPath, name),
          mode: "add",
          autorename: true,
          mute: false,
        }),
      }),
      body: uploadBody,
      duplex: "half",
    };
    await checkedJson<DropboxEntry>(
      await fetch("https://content.dropboxapi.com/2/files/upload", init),
      "Dropbox could not upload the file.",
    );
  } else {
    if (credentials.kind !== "webdav")
      throw new StorageHttpError(409, "WebDAV credentials are invalid.");
    const target = new URL(parentProviderItemId);
    if (!target.pathname.endsWith("/")) target.pathname += "/";
    target.pathname += encodeURIComponent(name);
    const init: StreamingRequestInit = {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(contentLength),
      },
      body: uploadBody,
      duplex: "half",
    };
    const response = await webDavRequest(credentials, target.href, init);
    if (!response.ok)
      throw new StorageHttpError(502, "WebDAV could not upload the file.");
  }
}

const googleExportFormats: Record<string, { mime: string; extension: string }> =
  {
    "application/vnd.google-apps.document": {
      mime: "application/pdf",
      extension: ".pdf",
    },
    "application/vnd.google-apps.spreadsheet": {
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: ".xlsx",
    },
    "application/vnd.google-apps.presentation": {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: ".pptx",
    },
    "application/vnd.google-apps.drawing": {
      mime: "image/png",
      extension: ".png",
    },
  };

export async function downloadProviderFile(
  context: StorageRequestContext,
  account: StorageAccountRow,
  credentials: StorageCredentials,
  item: StorageItemRow,
) {
  let response: Response;
  let name = item.name;
  let mimeType = item.mime_type || "application/octet-stream";
  if (account.provider === "google-drive") {
    const token = await providerToken(context, account, credentials);
    const exportFormat = item.mime_type
      ? googleExportFormats[item.mime_type]
      : null;
    if (exportFormat) {
      response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.provider_item_id)}/export?mimeType=${encodeURIComponent(exportFormat.mime)}`,
        { headers: oauthHeaders(token) },
      );
      name += exportFormat.extension;
      mimeType = exportFormat.mime;
    } else {
      response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.provider_item_id)}?alt=media`,
        { headers: oauthHeaders(token) },
      );
    }
  } else if (account.provider === "onedrive") {
    const token = await providerToken(context, account, credentials);
    response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item.provider_item_id)}/content`,
      { headers: oauthHeaders(token) },
    );
  } else if (account.provider === "dropbox") {
    const token = await providerToken(context, account, credentials);
    response = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: oauthHeaders(token, {
        "Dropbox-API-Arg": JSON.stringify({ path: `/${item.path}` }),
      }),
    });
  } else {
    if (credentials.kind !== "webdav")
      throw new StorageHttpError(409, "WebDAV credentials are invalid.");
    response = await webDavRequest(credentials, item.provider_item_id, {
      method: "GET",
    });
  }
  if (!response.ok)
    throw new StorageHttpError(
      502,
      "The provider could not download this file.",
    );
  return { response, name, mimeType };
}
