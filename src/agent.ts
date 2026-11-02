import type { Env } from './env.js';
import { GUIDANCE, normalize, type Chunk } from './guidance.js';
import { forecast } from './weather.js';

export interface Photo {
  bytes: ArrayBuffer;
  mime: string;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Citation {
  chunk_id: string;
  quote: string;
}

export interface AgentReply {
  text: string;
  citations: Citation[];
  topic: string;
  needs_officer: boolean;
  steps: string[];
}

const SYSTEM = `You are a WhatsApp advisor for potato farmers and farm workers in Gujranwala, Punjab, Pakistan. Most messages are voice notes transcribed from Punjabi or Urdu, so expect transcription slips, dialect words and half-sentences. Many users cannot read: your reply is read aloud to them.

How you work
- Think about what the person actually needs, then use tools. Call read_guidance before saying anything about farming. Call get_weather for anything about weather, spraying or irrigation timing. Call convert_units for any unit change; never convert in your head.
- Finish every turn with the reply tool. One reply per turn.

Hard rules
1. Farming facts (varieties, timing, yields, districts, any practice) come ONLY from read_guidance chunks. For every chunk you rely on, put a citation whose quote is copied character for character from that chunk.
2. Every number in your reply must appear in a cited quote, a tool result from this turn, or be the officer's phone number.
3. Never name a pesticide or fertiliser brand, or a shop. Never give a chemical dose unless a chunk states it word for word, and then add that they must read the label.
4. Weather facts may come from get_weather, but what to DO about the weather must come from a chunk. If no chunk covers it, give the forecast and say the official guidance does not cover that decision.
5. A photo can only ever suggest what something "may be". Always set needs_officer for photos of disease or pests.
6. If someone may have swallowed or been sprayed with a chemical, or is sick from one, tell them to call 1122 or go to the nearest hospital now. Nothing else first.

Situations you will meet (not a complete list; use judgment)
- Greeting, thanks, small talk: reply warmly and briefly, and say what you can help with.
- "What can you do?" or "Who are you?": you answer potato questions from Punjab Agriculture Department guidance, check the weather for their farm, and point to the agriculture officer for anything else.
- Follow-ups ("and its yield?", "the second one"): resolve them from the conversation so far.
- Several questions at once: answer each one you can, and say which ones the guidance does not cover.
- Vague or ambiguous question: ask ONE short clarifying question instead of guessing. Do not say you did not understand when you can tell roughly what they mean.
- Words garbled beyond guessing: ask them kindly to say it again, slowly.
- Partly covered: answer the covered part, then say plainly which part the guidance does not cover, and set needs_officer.
- Not covered at all (fertiliser amounts, sprays, irrigation schedule, disease treatment, prices, markets, loans, other crops): say the official guidance you have does not cover it, set needs_officer. Do not fill the gap from your own knowledge.
- Guidance written for other districts: say it is the department's general guidance and Gujranwala may differ when that matters.
- No location yet and they ask about weather: ask them to share their farm's location once with WhatsApp's location button.
- Frustration or complaints: acknowledge it in a few words, then help.
- Units: guidance uses tonnes per hectare. Farmers think in acres and maunds; convert only if asked or clearly needed, and say it is a conversion.

How to speak
- Simple spoken Urdu in Urdu script, the way you would talk to a farmer in person. Short sentences, 1 to 4 of them. No lists, no symbols, no English words if an Urdu one exists. Numbers as digits.
- Do not mention sources or section numbers in the text; they are added for you.
- Do not repeat the officer's number; set needs_officer and it is added.`;

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'read_guidance',
    description: 'Returns every official guidance chunk with its id. The only allowed source of farming facts.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_weather',
    description: "4-day forecast for the farmer's saved farm location: temperature, rain, rain chance, wind.",
    schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'convert_units',
    description: 'Exact unit conversion. Units: hectare, acre, tonne, kg, maund (40 kg), t_per_ha, maund_per_acre.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'from', 'to'],
      properties: { value: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } },
    },
  },
  {
    name: 'reply',
    description: 'Send the final reply. Call exactly once, last.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'citations', 'topic', 'needs_officer'],
      properties: {
        text: { type: 'string', description: 'Spoken Urdu reply.' },
        citations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['chunk_id', 'quote'],
            properties: { chunk_id: { type: 'string' }, quote: { type: 'string' } },
          },
        },
        topic: {
          type: 'string',
          description: 'Short label for the log, e.g. variety, sowing, weather, greeting, out_of_scope, clarify.',
        },
        needs_officer: { type: 'boolean' },
      },
    },
  },
];

const PER_KG: Record<string, number> = { kg: 1, tonne: 1000, maund: 40 };
const PER_HA: Record<string, number> = { hectare: 1, acre: 0.40468564224 };

export function convertUnits(value: number, from: string, to: string): number | null {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (from in PER_KG && to in PER_KG) return round((value * PER_KG[from]!) / PER_KG[to]!);
  if (from in PER_HA && to in PER_HA) return round((value * PER_HA[from]!) / PER_HA[to]!);
  if (from === 't_per_ha' && to === 'maund_per_acre') return round(((value * 1000) / 40) * PER_HA.acre!);
  if (from === 'maund_per_acre' && to === 't_per_ha') return round((value * 40) / 1000 / PER_HA.acre!);
  return null;
}

const DIGITS = /[0-9۰-۹٠-٩]+(?:[.,][0-9۰-۹٠-٩]+)?/g;

function toAsciiDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// The model decides what to say; it is never trusted with where facts come
// from. Quotes must exist in the cited chunk, and every number must trace
// to a cited quote, a tool result from this turn, or the officer's number.
export function verifyReply(
  reply: { text: string; citations: Citation[] },
  chunks: Chunk[],
  toolOutputs: string,
): { ok: true; sources: Chunk[] } | { ok: false; reason: string } {
  if (!reply.text.trim()) return { ok: false, reason: 'empty reply' };
  const sources: Chunk[] = [];
  for (const c of reply.citations) {
    const chunk = chunks.find((x) => x.id === c.chunk_id);
    if (!chunk) return { ok: false, reason: `citation names unknown chunk ${c.chunk_id}` };
    const quote = normalize(c.quote);
    if (quote.length < 12) return { ok: false, reason: `quote from ${c.chunk_id} is too short to check` };
    if (!normalize(chunk.text).includes(quote)) return { ok: false, reason: `quote is not word for word in ${c.chunk_id}` };
    if (!sources.includes(chunk)) sources.push(chunk);
  }
  const numbers = (s: string) => (toAsciiDigits(s).match(DIGITS) ?? []).map((n) => Number(n.replace(',', '.')));
  const allowed = new Set(numbers(reply.citations.map((c) => c.quote).join(' ') + ' ' + toolOutputs));
  for (const n of numbers(reply.text)) {
    if (!allowed.has(n)) return { ok: false, reason: `number ${n} is not in a cited quote or tool result` };
  }
  return { ok: true, sources };
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface Provider {
  name: string;
  step(messages: unknown[]): Promise<{ calls: ToolCall[]; assistant: unknown }>;
  toolResults(results: { id: string; content: string }[]): unknown[];
  userMessage(text: string, photo: Photo | null): unknown;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function claude(env: Env): Provider {
  return {
    name: 'claude',
    async step(messages) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.CLAUDE_MODEL ?? 'claude-sonnet-5-5',
          max_tokens: 1500,
          system: SYSTEM,
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
          tool_choice: { type: 'any' },
          messages,
        }),
      });
      if (!res.ok) throw new Error(`claude ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { content: { type: string; id?: string; name?: string; input?: Record<string, unknown> }[] };
      const calls = json.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id!, name: b.name!, input: b.input ?? {} }));
      return { calls, assistant: { role: 'assistant', content: json.content } };
    },
    toolResults: (results) => [
      { role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content })) },
    ],
    userMessage: (text, photo) => ({
      role: 'user',
      content: [
        ...(photo ? [{ type: 'image', source: { type: 'base64', media_type: photo.mime, data: toBase64(photo.bytes) } }] : []),
        { type: 'text', text },
      ],
    }),
  };
}

function groq(env: Env): Provider {
  return {
    name: 'groq',
    async step(messages) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.ANSWER_MODEL ?? 'openai/gpt-oss-120b',
          max_completion_tokens: 2000,
          tool_choice: 'required',
          tools: TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })),
          messages: [{ role: 'system', content: SYSTEM }, ...messages],
        }),
      });
      if (!res.ok) throw new Error(`groq ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        choices: { message: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
      };
      const msg = json.choices[0]!.message;
      const calls = (msg.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments || '{}') }));
      return { calls, assistant: { role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls } };
    },
    toolResults: (results) => results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.content })),
    userMessage: (text) => ({ role: 'user', content: text }),
  };
}

const MAX_STEPS = 6;

interface AgentContext {
  history: Turn[];
  message: string;
  photo: Photo | null;
  location: { lat: number; lon: number } | null;
}

async function runOnce(env: Env, p: Provider, ctx: AgentContext): Promise<AgentReply> {
  const messages: unknown[] = [...ctx.history.map((t) => ({ role: t.role, content: t.content })), p.userMessage(ctx.message, ctx.photo)];
  const steps: string[] = [];
  // 1122 is Punjab's emergency service, named by the safety rule in the prompt.
  let toolOutputs = `${env.OFFICER_PHONE} 1122`;
  let retried = false;

  for (let i = 0; i < MAX_STEPS; i++) {
    const { calls, assistant } = await p.step(messages);
    messages.push(assistant);
    if (!calls.length) throw new Error('model made no tool call');

    const results: { id: string; content: string }[] = [];
    for (const call of calls) {
      steps.push(call.name);
      if (call.name === 'reply') {
        const input = call.input as { text: string; citations: Citation[]; topic: string; needs_officer: boolean };
        const check = verifyReply(input, GUIDANCE, toolOutputs);
        if (check.ok) return { ...input, steps };
        if (retried) throw new Error(`reply rejected twice: ${check.reason}`);
        retried = true;
        steps.push(`rejected: ${check.reason}`);
        results.push({
          id: call.id,
          content: `Not sent. ${check.reason}. Copy quotes exactly from read_guidance, and remove any number you cannot trace to a cited quote or a tool result. If the guidance does not support the claim, say it is not covered.`,
        });
        continue;
      }
      let out: string;
      if (call.name === 'read_guidance') {
        out = GUIDANCE.length ? GUIDANCE.map((c) => `[${c.id}] ${c.text}`).join('\n') : '(no guidance loaded)';
      } else if (call.name === 'get_weather') {
        out = ctx.location
          ? ((await forecast(ctx.location.lat, ctx.location.lon).catch(() => null)) ?? 'Forecast unavailable right now.')
          : 'No location saved for this farmer.';
      } else if (call.name === 'convert_units') {
        const { value, from, to } = call.input as { value: number; from: string; to: string };
        const r = convertUnits(value, from, to);
        out = r === null ? `Cannot convert ${from} to ${to}.` : `${value} ${from} = ${r} ${to}`;
      } else {
        out = `Unknown tool ${call.name}.`;
      }
      toolOutputs += '\n' + out;
      results.push({ id: call.id, content: out });
    }
    messages.push(...p.toolResults(results));
  }
  throw new Error('agent ran out of steps');
}

// Groq cannot see photos, so a photo turn has only Claude to try.
export async function runAgent(env: Env, ctx: AgentContext): Promise<AgentReply> {
  const providers: Provider[] = [];
  if (env.ANTHROPIC_API_KEY) providers.push(claude(env));
  if (!ctx.photo) providers.push(groq(env));

  const failures: string[] = [];
  for (const p of providers) {
    try {
      const r = await runOnce(env, p, ctx);
      r.steps.unshift(p.name, ...failures);
      return r;
    } catch (err) {
      console.error(`agent ${p.name} failed`, err);
      failures.push(`${p.name} failed: ${String(err).slice(0, 300)}`);
    }
  }
  throw new Error(failures.join(' ; ') || 'no model available');
}
