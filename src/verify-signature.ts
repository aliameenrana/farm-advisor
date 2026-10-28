// Verifies Meta's X-Hub-Signature-256 header on inbound webhook POSTs.
//
// Without this, the webhook endpoint accepts any POST from anyone who
// knows the URL, with a spoofed wa_id, meaning a third party can
// impersonate a tester, inject messages into a real thread, trigger
// replies to a real phone number,
// The URL is not a secret (it's in client logs, CDN
// logs, and Meta's dashboard), so it cannot be the access control.
//
// Meta signs the RAW request body with the app secret. The body must be
// read as text and verified BEFORE being parsed as JSON, re-serializing
// parsed JSON produces different bytes (key order, whitespace, unicode
// escaping) and the HMAC will not match.

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

// Constant-time compare. A length-dependent early return is fine here
// (both sides are fixed-length SHA-256 digests), but the byte comparison
// itself must not short-circuit on first mismatch.
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const providedHex = signatureHeader.slice('sha256='.length).trim();
  const provided = hexToBytes(providedHex);
  if (!provided || provided.length !== 32) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)),
  );

  return timingSafeEqualBytes(provided, expected);
}
