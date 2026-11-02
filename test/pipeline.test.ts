/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/env.js';
import { FIXED } from '../src/replies.js';

// The whole Worker runs against real SQLite and a scripted network: WhatsApp,
// Whisper, Gemini and Groq are answered by the handlers below.

function fakeD1(db: DatabaseSync) {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    run: async () => {
      const r = db.prepare(sql).run(...(args as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (s: { run: () => Promise<unknown> }[]) => Promise.all(s.map((x) => x.run())) };
}

type Json = Record<string, unknown>;
interface Sent {
  to: string;
  type: string;
  text?: string;
}

let db: DatabaseSync;
let env: Env;
let sent: Sent[];
let agentCalls: Json[];
let geminiAgent: (body: Json) => Json | Promise<Json>;
let groqAgent: (body: Json) => Json;
let whisper: () => Response;
let sendFails: boolean;
let queued: unknown[];
let summaryCalls: Json[];
let summaryText: string;

const reply = (text: string, extra: Json = {}) => ({
  name: 'reply',
  args: { text, citations: [], topic: 'test', needs_officer: false, tone: 'warm', spoken_language: 'ur', punjabi_shahmukhi: '', spoken_text: '', ...extra },
});
const geminiSays = (call: { name: string; args: Json }) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: call }] } }] });
const groqSays = (call: { name: string; args: Json }) => ({
  choices: [{ message: { content: '', tool_calls: [{ id: 'g1', function: { name: call.name, arguments: JSON.stringify(call.args) } }] } }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.includes('graph.facebook.com') && url.endsWith('/messages')) {
    const body = JSON.parse(String(init!.body)) as Json & { text?: { body: string } };
    if (body.status === 'read') return json({ success: true });
    if (sendFails) return json({ error: { message: 'Recipient not allowed', code: 131030 } }, 400);
    sent.push({ to: String(body.to), type: String(body.type), text: body.text?.body });
    return json({ messages: [{ id: 'out' }] });
  }
  if (url.includes('graph.facebook.com') && url.endsWith('/media')) return json({ id: 'up1' });
  if (url.includes('graph.facebook.com')) return json({ url: 'https://media.test/voice', mime_type: 'audio/ogg' });
  if (url.startsWith('https://media.test/')) return new Response(new Uint8Array(100));
  if (url.includes('audio/transcriptions')) return whisper();
  if (url.includes('groq.com')) return json(groqAgent(JSON.parse(String(init!.body))));
  if (url.includes('-tts:')) {
    return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: btoa('\0'.repeat(4800)) } }] } }] });
  }
  if (url.includes('flash-lite')) {
    const body = JSON.parse(String(init!.body)) as Json;
    summaryCalls.push(body);
    return json({ candidates: [{ content: { parts: [{ text: summaryText }] } }] });
  }
  if (url.includes('generativelanguage')) {
    const body = JSON.parse(String(init!.body)) as Json;
    agentCalls.push(body);
    return json(await geminiAgent(body));
  }
  throw new Error(`unexpected fetch ${url}`);
}

function batch(messages: Json[]) {
  return { messages: messages.map((body) => ({ body, ack: vi.fn() })) } as unknown as MessageBatch<never>;
}
const text = (id: string, from: string, body: string) => ({ id, from, type: 'text', text: { body } });
const logs = () => db.prepare('SELECT input, outcome, sources, reply FROM log ORDER BY id').all() as { input: string; outcome: string; sources: string; reply: string }[];
const textsTo = (to: string) => sent.filter((s) => s.to === to && s.type === 'text').map((s) => s.text);
// The user turns Gemini saw on a call, oldest first.
const userTexts = (call: Json) =>
  (call.contents as { role: string; parts: { text?: string }[] }[]).filter((c) => c.role === 'user').map((c) => c.parts.map((p) => p.text ?? '').join(''));
const modelTexts = (call: Json) =>
  (call.contents as { role: string; parts: { text?: string }[] }[]).filter((c) => c.role === 'model').map((c) => c.parts.map((p) => p.text ?? '').join(''));

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sent = [];
  agentCalls = [];
  queued = [];
  summaryCalls = [];
  summaryText = 'Farmer Ali grows wheat on 12 acres near Kamoke.';
  sendFails = false;
  whisper = () => json({ text: 'آلو کب لگاؤں', segments: [{ avg_logprob: -0.2, no_speech_prob: 0.01 }] });
  groqAgent = () => groqSays(reply('گروک کا جواب'));
  env = {
    DB: fakeD1(db) as unknown as D1Database,
    JOBS: {
      sendBatch: async (m: unknown[]) => void queued.push(...m),
      send: async (m: unknown) => void queued.push(m),
    } as unknown as Queue<unknown>,
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_ACCESS_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '1',
    WHATSAPP_APP_SECRET: 'secret',
    GROQ_API_KEY: 'g',
    GEMINI_API_KEY: 'k',
    TESTER_SALT: 's',
    OFFICER_PHONE: '+920000000000',
    TTS_PROVIDER: 'gemini',
    GEMINI_TTS_MODEL: 'gemini-2.5-flash-preview-tts',
  };
  vi.stubGlobal('fetch', vi.fn(route));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('multi-turn conversation', () => {
  it('answers one farmer in order, each turn seeing the turns before it', async () => {
    const answers = ['پہلا جواب', 'دوسرا جواب', 'تیسرا جواب'];
    // The first answer is the slowest, so running them side by side would reorder the replies.
    geminiAgent = async () => {
      const n = agentCalls.length - 1;
      await new Promise((r) => setTimeout(r, (2 - n) * 20));
      return geminiSays(reply(answers[n]!));
    };
    await worker.queue(batch([text('a', '111', 'پہلا سوال'), text('b', '111', 'دوسرا سوال'), text('c', '111', 'تیسرا سوال')]), env);

    expect(textsTo('111')).toEqual(answers);
    expect(userTexts(agentCalls[2]!).map((t) => t.replace(/^\[.*?\]\n/, ''))).toEqual(['پہلا سوال', 'دوسرا سوال', 'تیسرا سوال']);
    expect(modelTexts(agentCalls[2]!)).toEqual(['پہلا جواب', 'دوسرا جواب']);
    expect(userTexts(agentCalls[0]!)[0]).toContain('start of the conversation');
    expect(userTexts(agentCalls[1]!)[0]).not.toContain('start of the conversation');
  });

  it('keeps two farmers in the same batch out of each other\'s history', async () => {
    geminiAgent = (body) => geminiSays(reply(userTexts(body).at(-1)!.includes('علی') ? 'علی کو جواب' : 'بلال کو جواب'));
    await worker.queue(batch([text('a', '111', 'میں علی ہوں'), text('b', '222', 'میں بلال ہوں'), text('c', '111', 'میرا نام کیا ہے')]), env);

    const third = agentCalls.find((c) => userTexts(c).at(-1)!.includes('میرا نام'))!;
    expect(JSON.stringify(third)).toContain('علی');
    expect(JSON.stringify(third)).not.toContain('بلال');
    expect(textsTo('222')).toEqual(['بلال کو جواب']);
  });

  it('sends the last ten messages word for word and nothing older', async () => {
    const words = ['ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات'];
    geminiAgent = () => geminiSays(reply(`جواب ${words[agentCalls.length - 1]}`));
    await worker.queue(batch(words.map((w, i) => text(`m${i}`, '111', `سوال ${w}`))), env);

    const last = agentCalls[6]!;
    expect(modelTexts(last)).toEqual(['جواب دو', 'جواب تین', 'جواب چار', 'جواب پانچ', 'جواب چھ']);
    expect(JSON.stringify(last)).not.toContain('سوال ایک');
    expect(JSON.stringify(last)).not.toContain('جواب ایک');
  });

  it('carries the follow-up across separate batches, as real messages arrive', async () => {
    geminiAgent = () => geminiSays(reply('سیالکوٹ ریڈ اور ایس ایچ پانچ'));
    await worker.queue(batch([text('a', '111', 'گوجرانوالہ میں کون سی قسم')]), env);
    geminiAgent = () => geminiSays(reply('دوسری والی ایس ایچ پانچ ہے'));
    await worker.queue(batch([text('b', '111', 'دوسری والی کون سی')]), env);

    expect(modelTexts(agentCalls[1]!)).toEqual(['سیالکوٹ ریڈ اور ایس ایچ پانچ']);
    expect(textsTo('111')).toEqual(['سیالکوٹ ریڈ اور ایس ایچ پانچ', 'دوسری والی ایس ایچ پانچ ہے']);
  });
});

describe('failures leave a record', () => {
  it('logs a WhatsApp refusal with Meta\'s error instead of claiming an answer', async () => {
    sendFails = true;
    geminiAgent = () => geminiSays(reply('جواب'));
    await worker.queue(batch([text('a', '111', 'سلام')]), env);

    const [row] = logs();
    expect(row!.outcome).toMatch(/^failed: .*whatsapp 400.*131030/);
    expect(row!.outcome).toContain('error reply failed');
    expect(logs()).toHaveLength(1);
  });

  it('logs failed delivery reports from the webhook', async () => {
    const raw = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [
        { id: 'w1', status: 'failed', recipient_id: '111', errors: [{ code: 131049, title: 'Not delivered', error_data: { details: 'ecosystem limit' } }] },
        { id: 'w2', status: 'delivered', recipient_id: '111' },
      ] } }] }],
    });
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const res = await worker.fetch(new Request('https://x/webhook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': `sha256=${sig}` } }), env);

    expect(res.status).toBe(200);
    expect(logs()).toEqual([expect.objectContaining({ input: 'delivery', outcome: 'undelivered: 131049 Not delivered ecosystem limit' })]);
    expect(queued).toHaveLength(0);
  });

  it('rejects an unsigned webhook without queueing or logging', async () => {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [text('a', '111', 'hi')] } }] }] });
    const res = await worker.fetch(new Request('https://x/webhook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=00' } }), env);
    expect(res.status).toBe(401);
    expect(queued).toHaveLength(0);
  });

  it('treats a Whisper outage as an error, not as the farmer mumbling', async () => {
    whisper = () => json({ error: 'overloaded' }, 503);
    await worker.queue(batch([{ id: 'a', from: '111', type: 'audio', audio: { id: 'v1' } }]), env);

    expect(logs()[0]!.outcome).toMatch(/^failed: .*whisper 503/);
    expect(textsTo('111')).toEqual([FIXED.error.ur.text]);
  });

  it('asks a farmer to repeat when Whisper heard only noise', async () => {
    whisper = () => json({ text: 'ہم', segments: [{ avg_logprob: -1.4, no_speech_prob: 0.2 }] });
    await worker.queue(batch([{ id: 'a', from: '111', type: 'audio', audio: { id: 'v1' } }]), env);

    expect(logs()[0]!.outcome).toBe('unclear_audio');
    expect(textsTo('111')).toEqual([FIXED.unclear.ur.text]);
    expect(agentCalls).toHaveLength(0);
  });

  it('answers a Punjabi speaker\'s crash in Punjabi', async () => {
    db.prepare("INSERT INTO testers (tester_hash, lang) VALUES (?, 'pa')").run(await hash('111'));
    whisper = () => json({}, 500);
    await worker.queue(batch([{ id: 'a', from: '111', type: 'audio', audio: { id: 'v1' } }]), env);
    expect(textsTo('111')).toEqual([FIXED.error.pa.text]);
  });

  it('answers each message once when Meta delivers it twice', async () => {
    geminiAgent = () => geminiSays(reply('جواب'));
    await worker.queue(batch([text('a', '111', 'سلام'), text('a', '111', 'سلام')]), env);
    await worker.queue(batch([text('a', '111', 'سلام')]), env);
    expect(textsTo('111')).toEqual(['جواب']);
    expect(agentCalls).toHaveLength(1);
  });
});

describe('the model misbehaving', () => {
  it('falls back to Groq when Gemini replies without text', async () => {
    geminiAgent = () => geminiSays({ name: 'reply', args: { citations: [], tone: 'warm' } });
    await worker.queue(batch([text('a', '111', 'سلام')]), env);

    expect(textsTo('111')).toEqual(['گروک کا جواب']);
    expect(logs()[0]!.sources).toMatch(/^groq>gemini failed: Error: reply had no text/);
  });

  it('sends the officer reply when both models invent a number twice', async () => {
    geminiAgent = () => geminiSays(reply('فی ایکڑ 40 بوری کھاد ڈالیں'));
    groqAgent = () => groqSays(reply('فی ایکڑ 40 بوری کھاد ڈالیں'));
    await worker.queue(batch([text('a', '111', 'کھاد کتنی')]), env);

    const out = textsTo('111');
    expect(out).toEqual([FIXED.unknown(env.OFFICER_PHONE).ur.text]);
    expect(out.join()).not.toContain('40');
    expect(logs()[0]!.outcome).toMatch(/^fallback: .*rejected twice/);
  });

  it('accepts the corrected reply after one rejection', async () => {
    geminiAgent = () => geminiSays(reply(agentCalls.length === 1 ? 'فی ایکڑ 40 بوری' : 'یہ ہدایات میں نہیں ہے'));
    await worker.queue(batch([text('a', '111', 'کھاد کتنی')]), env);

    expect(textsTo('111')[0]).toBe('یہ ہدایات میں نہیں ہے');
    expect(JSON.stringify(agentCalls[1]!.contents)).toContain('Not sent');
  });

  it('answers a voice note with audio first, then text', async () => {
    geminiAgent = () => geminiSays(reply('جواب'));
    await worker.queue(batch([{ id: 'a', from: '111', type: 'audio', audio: { id: 'v1' } }]), env);
    expect(sent.map((s) => s.type)).toEqual(['audio', 'text']);
  });

  it('answers typed messages with text alone and never calls the voice', async () => {
    geminiAgent = () => geminiSays(reply('جواب'));
    await worker.queue(batch([text('a', '111', 'سلام')]), env);
    expect(sent.map((s) => s.type)).toEqual(['text']);
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('-tts:'))).toBe(false);
  });

  it('keeps a typed message\'s error reply text-only too', async () => {
    geminiAgent = () => geminiSays(reply('جواب'));
    db.exec('DROP TABLE messages');
    await worker.queue(batch([text('a', '111', 'سلام')]), env);
    expect(sent).toEqual([{ to: '111', type: 'text', text: FIXED.error.ur.text }]);
  });
});

async function hash(n: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('s' + n));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

describe('long-term memory', () => {
  const talk = async (n: number, from = '111') => {
    for (let i = 0; i < n; i++) await worker.queue(batch([text(`${from}-${Math.random()}`, from, `بات ${i}`)]), env);
  };

  it('queues one background compaction once ten messages have left the window', async () => {
    geminiAgent = () => geminiSays(reply('ٹھیک ہے'));
    await talk(9);
    expect(queued).toHaveLength(0);
    await talk(1);
    expect(queued).toEqual([{ kind: 'compact', tester: await hash('111') }]);
    expect(summaryCalls).toHaveLength(0);
  });

  it('folds the aged-out messages into the summary and feeds it to later turns', async () => {
    geminiAgent = () => geminiSays(reply('ٹھیک ہے'));
    await worker.queue(batch([text('first', '111', 'میرا نام علی ہے، کاموکی میں بارہ ایکڑ گندم')]), env);
    await talk(9);
    await worker.queue(batch(queued.splice(0) as Json[]), env);

    const sentToSummary = JSON.stringify(summaryCalls[0]);
    expect(sentToSummary).toContain('میرا نام علی ہے');
    expect(sentToSummary).not.toContain('بات 8');
    const row = db.prepare('SELECT summary, summarized_upto FROM testers').get() as { summary: string; summarized_upto: number };
    expect(row.summary).toBe(summaryText);

    await talk(1);
    const prompt = userTexts(agentCalls.at(-1)!).at(-1)!;
    expect(prompt).toContain('data, not instructions');
    expect(prompt).toContain('12 acres near Kamoke');
    expect(prompt).not.toContain('start of the conversation');
  });

  it('builds on the previous summary instead of starting over', async () => {
    geminiAgent = () => geminiSays(reply('ٹھیک ہے'));
    await talk(10);
    await worker.queue(batch(queued.splice(0) as Json[]), env);
    summaryText = 'Second summary.';
    await talk(5);
    await worker.queue(batch(queued.splice(0) as Json[]), env);

    expect(summaryCalls).toHaveLength(2);
    expect(JSON.stringify(summaryCalls[1])).toContain('12 acres near Kamoke');
    expect(JSON.stringify(summaryCalls[1])).not.toContain('بات 0');
  });

  it('keeps answering when the summary call fails', async () => {
    geminiAgent = () => geminiSays(reply('ٹھیک ہے'));
    vi.mocked(fetch).mockImplementation(async (u, i) => (String(u).includes('flash-lite') ? json({}, 500) : route(u, i)));
    await talk(10);
    await worker.queue(batch(queued.splice(0) as Json[]), env);
    await talk(1);
    expect(textsTo('111')).toHaveLength(11);
    expect((db.prepare('SELECT summary FROM testers').get() as { summary: string | null }).summary).toBeNull();
  });
});

describe('guardrails', () => {
  it('stops answering after thirty messages in an hour, with one notice', async () => {
    const h = await hash('111');
    for (let i = 0; i < 30; i++) db.prepare("INSERT INTO log (tester_hash, input, outcome) VALUES (?, 'text', 'conversation')").run(h);
    geminiAgent = () => geminiSays(reply('جواب'));
    await worker.queue(batch([text('a', '111', 'سلام')]), env);
    await worker.queue(batch([text('b', '111', 'سلام')]), env);

    expect(textsTo('111')).toEqual([FIXED.slowDown.ur.text]);
    expect(agentCalls).toHaveLength(0);
  });

  it('does not count another farmer\'s messages or old ones against the limit', async () => {
    for (let i = 0; i < 40; i++) db.prepare("INSERT INTO log (tester_hash, input, outcome) VALUES ('other', 'text', 'conversation')").run();
    for (let i = 0; i < 40; i++) db.prepare("INSERT INTO log (tester_hash, at, input, outcome) VALUES (?, datetime('now', '-2 days'), 'text', 'x')").run(await hash('111'));
    geminiAgent = () => geminiSays(reply('جواب'));
    await worker.queue(batch([text('a', '111', 'سلام')]), env);
    expect(textsTo('111')).toEqual(['جواب']);
  });

  it('asks the farmer to type after two unclear voice notes in a row, and resets after a clear one', async () => {
    whisper = () => json({ text: 'ہم', segments: [{ avg_logprob: -1.4, no_speech_prob: 0.2 }] });
    const voice = (id: string) => ({ id, from: '111', type: 'audio', audio: { id: 'v1' } });
    await worker.queue(batch([voice('a'), voice('b')]), env);
    whisper = () => json({ text: 'آلو کب لگاؤں', segments: [{ avg_logprob: -0.2, no_speech_prob: 0.01 }] });
    geminiAgent = () => geminiSays(reply('جواب'));
    await worker.queue(batch([voice('c')]), env);
    whisper = () => json({ text: 'ہم', segments: [{ avg_logprob: -1.4, no_speech_prob: 0.2 }] });
    await worker.queue(batch([voice('d')]), env);

    expect(textsTo('111')).toEqual([FIXED.unclear.ur.text, FIXED.typeIt(env.OFFICER_PHONE).ur.text, 'جواب', FIXED.unclear.ur.text]);
  });

  it('refuses a voice note longer than about two minutes without transcribing it', async () => {
    vi.mocked(fetch).mockImplementation(async (u, i) =>
      String(u).startsWith('https://media.test/') ? new Response(new Uint8Array(300_000)) : route(u, i),
    );
    let whisperCalled = false;
    whisper = () => ((whisperCalled = true), json({}));
    await worker.queue(batch([{ id: 'a', from: '111', type: 'audio', audio: { id: 'v1' } }]), env);
    expect(textsTo('111')).toEqual([FIXED.tooLong.ur.text]);
    expect(whisperCalled).toBe(false);
  });

  it('never sends a link, even when the model writes one twice', async () => {
    geminiAgent = () => geminiSays(reply('مزید کے لیے www.example.pk دیکھیں'));
    groqAgent = () => groqSays(reply('دیکھیں https://example.com'));
    await worker.queue(batch([text('a', '111', 'کوئی ویب سائٹ بتاؤ')]), env);
    expect(textsTo('111').join()).not.toMatch(/example/);
    expect(logs()[0]!.outcome).toMatch(/links are not allowed/);
  });
});

