import type { Env } from './env.js';
import { GUIDANCE, normalize, type Chunk } from './guidance.js';

export const TOPICS = ['variety', 'sowing', 'fertiliser', 'water', 'disease', 'weather', 'other'] as const;

export interface ModelAnswer {
  status: 'answer' | 'unknown' | 'unclear';
  question: string;
  topic: (typeof TOPICS)[number];
  answer: string;
  citations: { chunk_id: string; quote: string }[];
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'question', 'topic', 'answer', 'citations'],
  properties: {
    status: { type: 'string', enum: ['answer', 'unknown', 'unclear'] },
    question: { type: 'string' },
    topic: { type: 'string', enum: [...TOPICS] },
    answer: { type: 'string' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chunk_id', 'quote'],
        properties: { chunk_id: { type: 'string' }, quote: { type: 'string' } },
      },
    },
  },
};

const SYSTEM = `You advise potato farmers in Gujranwala, Punjab, Pakistan over WhatsApp. Messages are transcribed voice notes in Punjabi or Urdu and may contain transcription errors.

Rules you never break:
1. Use ONLY the official guidance chunks and the weather forecast given below. Nothing from your own knowledge.
2. status "unclear": the message is garbled or you cannot tell what is being asked. Do not guess.
3. status "unknown": the question is clear but the chunks do not answer it. Leave answer empty.
4. status "answer": every fact in your answer is supported by a chunk. For each chunk you used, copy a supporting passage from it EXACTLY, character for character, into citations.quote.
5. Never name a pesticide or fertiliser brand, or a shop.
6. Never give a chemical dose or quantity unless a chunk states it, and then copy its numbers exactly.
7. Weather numbers may be used for timing of spraying and irrigation, but the advice itself must come from a chunk.
8. Guidance written for other districts: say so in the answer if it matters.
9. A photo can only ever suggest what something "may be" (ہو سکتا ہے). Never a diagnosis.

Write "answer" in simple spoken Urdu, at most 3 short sentences, as if speaking to a farmer who may not read. No lists, no symbols, no English words if an Urdu one exists. Do not mention sources; they are added separately. "question" is the farmer's question restated clearly in Urdu.`;

function guidanceBlock(chunks: Chunk[]): string {
  if (!chunks.length) return '<guidance>(none available)</guidance>';
  return chunks.map((c) => `<chunk id="${c.id}" source="${c.source}, ${c.page}">\n${c.text}\n</chunk>`).join('\n');
}

export interface Photo {
  bytes: ArrayBuffer;
  mime: string;
}

function buildContext(input: { text: string | null; weather: string | null }): string {
  return (
    `${guidanceBlock(GUIDANCE)}\n\n<weather>\n${input.weather ?? 'Not available: the farmer has not shared a location.'}\n</weather>\n\n` +
    `<farmer_message>\n${input.text ?? '(no words, photo only)'}\n</farmer_message>`
  );
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function askGemini(env: Env, context: string, photo: Photo | null): Promise<ModelAnswer> {
  const parts: Record<string, unknown>[] = [];
  if (photo) parts.push({ inline_data: { mime_type: photo.mime, data: toBase64(photo.bytes) } });
  parts.push({ text: context });

  const model = env.GEMINI_MODEL ?? 'gemini-flash-latest';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`gemini failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!content) throw new Error('gemini returned no content');
  return JSON.parse(content) as ModelAnswer;
}

async function askClaude(env: Env, context: string, photo: Photo | null): Promise<ModelAnswer> {
  const content: Record<string, unknown>[] = [];
  if (photo) content.push({ type: 'image', source: { type: 'base64', media_type: photo.mime, data: toBase64(photo.bytes) } });
  content.push({ type: 'text', text: context });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL ?? 'claude-sonnet-5-5',
      max_tokens: 1500,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`claude failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = json.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  if (!text) throw new Error('claude returned no content');
  return JSON.parse(text) as ModelAnswer;
}

// Vision-capable providers first, in order of whichever keys are set; Groq
// keeps text questions answered when they are down or out of credit. A
// photo has no text-only fallback, so that error goes to the caller.
export async function askModel(
  env: Env,
  input: { text: string | null; weather: string | null; photo: Photo | null },
): Promise<ModelAnswer> {
  const context = buildContext(input);
  const providers: [string, () => Promise<ModelAnswer>][] = [];
  if (env.ANTHROPIC_API_KEY) providers.push(['claude', () => askClaude(env, context, input.photo)]);
  if (env.GEMINI_API_KEY) providers.push(['gemini', () => askGemini(env, context, input.photo)]);

  let lastErr: unknown = null;
  for (const [name, ask] of providers) {
    try {
      return await ask();
    } catch (err) {
      console.error(`${name} failed`, err);
      lastErr = err;
    }
  }
  if (input.photo) throw lastErr ?? new Error('no vision model configured');
  if (input.photo) throw new Error('no vision model configured');
  return askGroq(env, context);
}

async function askGroq(env: Env, context: string): Promise<ModelAnswer> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.ANSWER_MODEL ?? 'openai/gpt-oss-120b',
      max_completion_tokens: 2000,
      reasoning_effort: 'medium',
      response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: context },
      ],
    }),
  });
  if (!res.ok) throw new Error(`answer model failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('answer model returned no content');
  return JSON.parse(content) as ModelAnswer;
}

const DIGITS = /[0-9۰-۹٠-٩]+/g;

function toAsciiDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// Rule 1 and rule 3 are enforced here rather than trusted to the model: a
// citation must quote real text from a real chunk, and every number in the
// answer must appear in a cited quote or the forecast.
export function verify(
  ans: ModelAnswer,
  chunks: Chunk[],
  weather: string | null,
): { ok: true; sources: Chunk[] } | { ok: false; reason: string } {
  if (ans.status !== 'answer') return { ok: false, reason: ans.status };
  if (!ans.answer.trim()) return { ok: false, reason: 'empty answer' };
  if (!ans.citations.length) return { ok: false, reason: 'no citations' };

  const sources: Chunk[] = [];
  for (const c of ans.citations) {
    const chunk = chunks.find((x) => x.id === c.chunk_id);
    if (!chunk) return { ok: false, reason: `unknown chunk ${c.chunk_id}` };
    const quote = normalize(c.quote);
    if (quote.length < 12) return { ok: false, reason: 'quote too short' };
    if (!normalize(chunk.text).includes(quote)) return { ok: false, reason: `quote not in ${chunk.id}` };
    if (!sources.includes(chunk)) sources.push(chunk);
  }

  const allowed = toAsciiDigits(ans.citations.map((c) => c.quote).join(' ') + ' ' + (weather ?? ''));
  for (const n of toAsciiDigits(ans.answer).match(DIGITS) ?? []) {
    if (!new RegExp(`(^|\\D)${n}(\\D|$)`).test(allowed)) return { ok: false, reason: `number ${n} not in sources` };
  }
  return { ok: true, sources };
}
