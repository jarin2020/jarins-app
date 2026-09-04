import "server-only";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function encryptionKeyBytes() {
  const raw =
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY ||
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_TOKEN_ENCRYPTION_KEY is not configured on the server.",
    );
  }
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== 32) {
    throw new Error(
      "INTEGRATION_TOKEN_ENCRYPTION_KEY must be 32 bytes in base64.",
    );
  }
  return bytes;
}

async function encryptionKey() {
  return crypto.subtle.importKey(
    "raw",
    encryptionKeyBytes(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(JSON.stringify(value)),
  );
  return {
    ciphertext: base64(new Uint8Array(ciphertext)),
    iv: base64(iv),
  };
}

export async function decryptSecret<T>(ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(),
    fromBase64(ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function randomUrlToken(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString(
    "base64url",
  );
}

export async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Buffer.from(hash).toString("hex");
}

export async function pkceChallenge(verifier: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return Buffer.from(hash).toString("base64url");
}
