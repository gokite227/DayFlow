/**
 * PKCE (RFC 7636, S256) for the DayFlow login. The verifier stays on the device; only the challenge goes to
 * the server when the login starts. Web passes WebCrypto, Mobile passes expo-crypto.
 */
export interface PkceCrypto {
  randomBytes(length: number): Uint8Array | Promise<Uint8Array>;
  sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array>;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/** base64url without padding (no Buffer/btoa, so it runs the same in browsers, Node and React Native). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += BASE64URL[a >> 2]!;
    output += BASE64URL[((a & 0x03) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) output += BASE64URL[((b & 0x0f) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) output += BASE64URL[c & 0x3f]!;
  }
  return output;
}

export function isCodeVerifier(value: string): boolean {
  return VERIFIER_PATTERN.test(value);
}

/** The S256 challenge of a verifier: base64url(SHA-256(ASCII(verifier))). */
export async function codeChallengeOf(verifier: string, crypto: Pick<PkceCrypto, "sha256">): Promise<string> {
  const ascii = new Uint8Array(verifier.length);
  for (let index = 0; index < verifier.length; index += 1) ascii[index] = verifier.charCodeAt(index);
  return base64UrlEncode(await crypto.sha256(ascii));
}

/** A new verifier from 32 random bytes (43 characters) and its challenge. */
export async function createPkcePair(crypto: PkceCrypto): Promise<PkcePair> {
  const verifier = base64UrlEncode(await crypto.randomBytes(32));
  return { verifier, challenge: await codeChallengeOf(verifier, crypto) };
}
