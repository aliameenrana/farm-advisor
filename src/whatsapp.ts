import type { Env } from './env.js';

const GRAPH = 'https://graph.facebook.com/v22.0';

async function post(env: Env, to: string, message: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...(to ? { to } : {}), ...message }),
  });
  // Meta's refusal is the only clue when a farmer gets nothing, so it is
  // raised for the caller to record rather than printed and dropped.
  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return true;
}

export function sendText(env: Env, to: string, body: string): Promise<boolean> {
  return post(env, to, { type: 'text', text: { body: body.slice(0, 4000) } });
}

// WhatsApp only shows audio as a voice note when it is OGG/Opus; MP3 arrives
// as a playable audio file.
export async function sendVoice(env: Env, to: string, speech: { bytes: ArrayBuffer; mime: string }): Promise<boolean> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', speech.mime);
  form.append('file', new Blob([speech.bytes], { type: speech.mime }), speech.mime === 'audio/mpeg' ? 'reply.mp3' : 'reply.ogg');
  const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!json.id) throw new Error(`whatsapp media upload ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return post(env, to, { type: 'audio', audio: { id: json.id } });
}

// The webhook only carries a media id; the bytes need two authenticated fetches.
export async function downloadMedia(env: Env, mediaId: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const auth = { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) return null;
  const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
  if (!url) return null;
  const file = await fetch(url, { headers: auth });
  if (!file.ok) return null;
  return { bytes: await file.arrayBuffer(), mime: mime_type ?? 'application/octet-stream' };
}

export function markRead(env: Env, messageId: string): Promise<boolean> {
  return post(env, '', { status: 'read', message_id: messageId, typing_indicator: { type: 'text' } });
}
