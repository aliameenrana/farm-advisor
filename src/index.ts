import type { Env } from './env.js';
import { verifyMetaSignature } from './verify-signature.js';
import { downloadMedia, markRead, sendText, sendVoice } from './whatsapp.js';
import { transcribe } from './transcribe.js';
import { forecast } from './weather.js';
import { askModel, verify, type Photo } from './answer.js';
import { GUIDANCE } from './guidance.js';
import { speakUrdu } from './tts.js';
import { REPLY, sourceLine } from './replies.js';

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
  const audio = await speakUrdu(env, text);
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
    if (/^(hi|hello|salam|سلام|السلام|start)\b/i.test(text.trim()) && text.length < 30) {
      await log(env, tester, { input: 'text', outcome: 'welcome' });
      return reply(env, to, REPLY.welcome);
    }
  } else {
    return reply(env, to, REPLY.unsupported);
  }

  const input = msg.type === 'audio' ? 'voice' : msg.type;
  const place = await env.DB.prepare('SELECT lat, lon FROM testers WHERE tester_hash = ?')
    .bind(tester)
    .first<{ lat: number | null; lon: number | null }>();
  const weather = place?.lat != null && place.lon != null ? await forecast(place.lat, place.lon).catch(() => null) : null;

  let ans;
  try {
    ans = await askModel(env, { text, weather, photo });
  } catch (err) {
    if (!photo) throw err;
    console.error('photo answer failed', err);
    await log(env, tester, { input, outcome: 'photo_redirect' });
    return reply(env, to, REPLY.photo(env.OFFICER_PHONE));
  }
  const checked = verify(ans, GUIDANCE, weather);

  if (!checked.ok) {
    const out = ans.status === 'unclear' ? REPLY.unclear : REPLY.unknown(env.OFFICER_PHONE);
    await log(env, tester, {
      input,
      transcript,
      confidence,
      topic: ans.topic,
      outcome: ans.status === 'answer' ? `rejected: ${checked.reason}` : ans.status,
      reply: out,
    });
    return reply(env, to, out);
  }

  const parts = [ans.answer.trim()];
  if (/\d|[۰-۹]/.test(ans.answer) && (ans.topic === 'fertiliser' || ans.topic === 'disease')) parts.push(REPLY.readLabel);
  if (photo || ans.topic === 'disease') parts.push(REPLY.photoCheck(env.OFFICER_PHONE));
  // The source line goes in the text only; read aloud it would be noise.
  const spoken = parts.join(' ');
  const written = `${spoken}\n\n${sourceLine(checked.sources)}`;

  const audio = await speakUrdu(env, spoken);
  if (audio) await sendVoice(env, to, audio);
  await sendText(env, to, written);
  await log(env, tester, {
    input,
    transcript,
    confidence,
    topic: ans.topic,
    outcome: 'answered',
    sources: checked.sources.map((s) => s.id).join(','),
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
