// Encrypts wearable OAuth tokens before they're stored in device_connections,
// so a database leak alone doesn't hand over access to members' Google or
// Oura accounts. AES-256-GCM with a random 12-byte IV per value; the key lives
// only in the TOKEN_ENCRYPTION_KEY env var (32 bytes, base64), never in the
// database.
//
// Stored form: "enc:v1:<base64 of iv + ciphertext>". Values without the prefix
// are plain text from before encryption; they're still readable and are
// re-encrypted the next time the token is refreshed (the nightly sync does
// this for every active connection).

const PREFIX = "enc:v1:";

let keyPromise: Promise<CryptoKey> | null = null;

function key() {
  if (!keyPromise) {
    let bytes = new Uint8Array();
    try { bytes = fromB64(process.env.TOKEN_ENCRYPTION_KEY ?? ""); } catch { /* reported below */ }
    if (bytes.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.");
    }
    keyPromise = crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  return keyPromise;
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return PREFIX + toB64(out);
}

export async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) return stored;
  const bytes = fromB64(stored.slice(PREFIX.length));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(), bytes.slice(12));
  return new TextDecoder().decode(plain);
}
