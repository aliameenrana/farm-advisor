import type { Env } from './env.js';
import { verifyMetaSignature } from './verify-signature.js';
import { downloadMedia, markRead, sendText, sendVoice } from './whatsapp.js';
import { transcribe } from './transcribe.js';
import { runAgent, type AgentReply, type Photo, type Turn } from './agent.js';
import { GUIDANCE } from './guidance.js';
import { speak } from './tts.js';
import { REPLY, sourceLine } from './replies.js';

const HISTORY_TURNS = 6;

interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  audio?: { id: string };
  image?: { id: string; caption?: string };
  location?: { latitude: number; longitude: number };
}

interface LogRow {
  input: string;
  transcript?: string | null;
  confidence?: number | null;
  topic?: string | null;
  outcome: string;
  sources?: string | null;
  reply?: string | null;
}

async function hashNumber(env: Env, waId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.TESTER_SALT + waId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function log(env: Env, tester: string, row: LogRow): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO log (tester_hash, input, transcript, confidence, topic, outcome, sources, reply) VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(tester, row.input, row.transcript ?? null, row.confidence ?? null, row.topic ?? null, row.outcome, row.sources ?? null, row.reply ?? null)
    .run();
}

// Workers who cannot read need every reply as a voice note; the text goes too
// so the farm owner can check it.
async function reply(env: Env, to: string, text: string): Promise<void> {
  const audio = await speak(env, text);
  if (audio) await sendVoice(env, to, audio);
  await sendText(env, to, text);
}

async function handle(env: Env, msg: InboundMessage): Promise<void> {
  const fresh = await env.DB.prepare('INSERT OR IGNORE INTO seen_messages (message_id) VALUES (?)').bind(msg.id).run();
  if (!fresh.meta.changes) return;

  const to = msg.from;
  const tester = await hashNumber(env, to);
  await markRead(env, msg.id).catch(() => undefined);

  if (msg.type === 'location' && msg.location) {
    await env.DB.prepare(
      'INSERT INTO testers (tester_hash, lat, lon) VALUES (?,?,?) ON CONFLICT(tester_hash) DO UPDATE SET lat = excluded.lat, lon = excluded.lon',
    )
      .bind(tester, msg.location.latitude, msg.location.longitude)
      .run();
    await log(env, tester, { input: 'location', outcome: 'location_saved' });
    return reply(env, to, REPLY.locationSaved);
  }

  let text: string | null = null;
  let transcript: string | null = null;
  let confidence: number | null = null;
  let photo: Photo | null = null;

  if (msg.type === 'audio' && msg.audio) {
    const media = await downloadMedia(env, msg.audio.id);
    const t = media && (await transcribe(env, media.bytes));
    const minConfidence = Number(env.MIN_CONFIDENCE ?? '-0.9');
    if (!t || t.noSpeech || !t.text || t.confidence < minConfidence) {
      await log(env, tester, { input: 'voice', transcript: t?.text, confidence: t?.confidence, outcome: 'unclear_audio' });
      return reply(env, to, REPLY.unclear);
    }
    text = transcript = t.text;
    confidence = t.confidence;
  } else if (msg.type === 'image' && msg.image) {
    photo = await downloadMedia(env, msg.image.id);
    text = msg.image.caption ?? null;
  } else if (msg.type === 'text' && msg.text) {
    text = msg.text.body.slice(0, 1500);
  } else {
    return reply(env, to, REPLY.unsupported);
  }

  const input = msg.type === 'audio' ? 'voice' : msg.type;
  const place = await env.DB.prepare('SELECT lat, lon FROM testers WHERE tester_hash = ?')
    .bind(tester)
    .first<{ lat: number | null; lon: number | null }>();
  const location = place?.lat != null && place.lon != null ? { lat: place.lat, lon: place.lon } : null;
  const { results: past } = await env.DB.prepare(
    'SELECT role, content FROM (SELECT id, role, content FROM messages WHERE tester_hash = ? ORDER BY id DESC LIMIT ?) ORDER BY id',
  )
    .bind(tester, HISTORY_TURNS)
    .all<Turn>();
  const message = text ?? '(photo with no caption)';

  let ans: AgentReply;
  try {
    ans = await runAgent(env, { history: past, message, photo, location });
  } catch (err) {
    console.error('agent failed', err);
    const out = photo ? REPLY.photo(env.OFFICER_PHONE) : REPLY.unknown(env.OFFICER_PHONE);
    await log(env, tester, { input, transcript, confidence, outcome: `fallback: ${String(err).slice(0, 200)}`, reply: out });
    return reply(env, to, out);
  }

  const sources = GUIDANCE.filter((c) => ans.citations.some((x) => x.chunk_id === c.id));
  const parts = [ans.text.trim()];
  if (ans.needs_officer || photo) parts.push(REPLY.officer(env.OFFICER_PHONE));
  const spoken = parts.join(' ');
  // The source line goes in the text only; read aloud it would be noise.
  const written = sources.length ? `${spoken}\n\n${sourceLine(sources)}` : spoken;

  const audio = await speak(env, spoken);
  if (audio) await sendVoice(env, to, audio);
  await sendText(env, to, written);

  await env.DB.batch([
    env.DB.prepare('INSERT INTO messages (tester_hash, role, content) VALUES (?,?,?)').bind(tester, 'user', message),
    env.DB.prepare('INSERT INTO messages (tester_hash, role, content) VALUES (?,?,?)').bind(tester, 'assistant', ans.text),
  ]);
  await log(env, tester, {
    input,
    transcript,
    confidence,
    topic: ans.topic,
    outcome: sources.length ? 'answered' : ans.needs_officer ? 'referred' : 'conversation',
    sources: [ans.steps.join('>'), sources.map((x) => x.id).join(',')].filter(Boolean).join(' | '),
    reply: written,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/webhook') return new Response('ok');

    if (request.method === 'GET') {
      const ok =
        url.searchParams.get('hub.mode') === 'subscribe' &&
        url.searchParams.get('hub.verify_token') === env.WHATSAPP_VERIFY_TOKEN;
      return ok ? new Response(url.searchParams.get('hub.challenge') ?? '') : new Response('forbidden', { status: 403 });
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    const raw = await request.text();
    if (!(await verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET))) {
      return new Response('bad signature', { status: 401 });
    }

    const body = JSON.parse(raw) as {
      entry?: { changes?: { value?: { messages?: InboundMessage[] } }[] }[];
    };
    const messages = body.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

    // Meta retries any webhook not acknowledged within a few seconds, and the
    // model call takes longer than that.
    for (const msg of messages) {
      ctx.waitUntil(
        handle(env, msg).catch(async (err) => {
          console.error('handle failed', err);
          await sendText(env, msg.from, REPLY.error).catch(() => undefined);
        }),
      );
    }
    return new Response('ok');
  },
};
