import type { Env } from './env.js';
import { GUIDANCE, normalize, type Chunk } from './guidance.js';
import { findPlace, forecast } from './weather.js';

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

export type Tone = 'cheerful' | 'warm' | 'calm' | 'concerned' | 'urgent';

type AgentReplyInput = Omit<AgentReply, 'steps'>;

export interface AgentReply {
  text: string;
  citations: Citation[];
  topic: string;
  needs_officer: boolean;
  tone?: Tone;
  spoken_language?: 'ur' | 'pa';
  punjabi_shahmukhi?: string;
  spoken_text?: string;
  steps: string[];
}

const RULES = `You are a WhatsApp advisor for potato farmers and farm workers in Gujranwala, Punjab, Pakistan. Most messages are voice notes transcribed from Punjabi or Urdu, so expect transcription slips, dialect words and half-sentences. Many users cannot read: your reply is read aloud to them.

How you work
- Think about what the person actually needs. The official guidance is at the end of these instructions; it is your only source of farming facts. Call get_weather for anything about weather, spraying or irrigation timing. Call convert_units for any unit change; never convert in your head.
- Finish every turn with the reply tool. One reply per turn.

Hard rules
1. Farming facts (varieties, timing, yields, districts, any practice) come ONLY from the guidance chunks below. For every chunk you rely on, put a citation whose quote is copied character for character from that chunk.
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
- Places: the farmer's saved farm location is given with each message. When a question names another town or district, answer about THAT place: use guidance for that district, and get_weather with place set. Use the saved farm only when no place is named. If the guidance says nothing specific about the named place, say so and give what it says for Punjab generally.
- No saved location: if this is the start of the conversation, after answering, ask once for the farm's location via WhatsApp's location button, saying it is for weather advice. If they ask about weather with no place and no saved location, ask for it. Do not keep asking every turn.
- Frustration or complaints: acknowledge it in a few words, then help.
- Energy: match the person's mood. An excited greeting ("assalamoalaikuuuum!!") gets an equally happy, lively reply; a tired or worried message gets a calm, gentle one. Never match anger or rudeness: stay calm and kind. Emergencies are always calm and urgent, never cheerful. Always respectful; many farmers are elders. Pick tone to match.
- Units: guidance uses tonnes per hectare. Farmers think in acres and maunds; convert only when they ask for acres or maunds. Yield conversions are listed below; use convert_units only for other values, all in one call. Say it is a conversion. A question about yield alone is answered in the guidance's own units.

Language
- Reply in the language they used. Transcripts of Punjabi voice notes come out in Urdu script with Punjabi words (ڈی، کیہڑی، اے، دا، نوں، لئی، چنگی), so judge by the words, not the script.
- Urdu message: spoken_language "ur"; punjabi_shahmukhi and spoken_text are empty.
- Punjabi message: spoken_language "pa". First write punjabi_shahmukhi: the reply in Pakistani Punjabi as spoken in Gujranwala, in Shahmukhi, using the words a Pakistani farmer uses (فی, ایکڑ, من, مہربانی, شکریہ, زراعت, پیداوار, مشورہ, مسئلہ, ویلا). Then spoken_text: the same words written in standard Gurmukhi spelling, the way a Punjabi reader spells them (ਂ ੰ for nasals, ੱ for doubled consonants), so a voice reads them naturally. Keep every word Pakistani: never swap in Indian or Sanskrit-derived words (ਪ੍ਰਤੀ, ਕਿਰਪਾ, ਧੰਨਵਾਦ, ਖੇਤੀਬਾੜੀ, ਸਮੱਸਿਆ, ਉਪਜ, ਜਾਣਕਾਰੀ, ਵਿਭਾਗ). Spell names exactly: ਗੁਜਰਾਂਵਾਲਾ, ਸਿਆਲਕੋਟ, ਸਾਹੀਵਾਲ, ਓਕਾੜਾ, ਕਸੂਰ, ਪਾਕਪਤਨ, ਦੀਪਾਲਪੁਰ, ਲਾਹੌਰ, ਸਿਆਲਕੋਟ ਰੈੱਡ, ਸਾਹੀਵਾਲ ਰੈੱਡ, ਸਾਹੀਵਾਲ ਵਾਈਟ, ਕੌਸਮੋ, ਸਦਫ਼, ਰੂਬੀ, ਪੀ ਆਰ ਆਈ ਰੈੱਡ, ਐੱਸ ਐੱਚ 5, ਐੱਫ਼ ਡੀ, ਹੈਕਟੇਅਰ, ਏਕੜ, ਮਣ, ਫ਼ੀ. Same facts and numbers as text, nothing added.
- text is always Urdu, for the farm owner to read.

How to speak
- Simple spoken Urdu in Urdu script, the way you would talk to a farmer in person. Short sentences, 1 to 4 of them. No lists, no symbols, no English words if an Urdu one exists. Numbers as digits.
- Do not mention sources or section numbers in the text; they are added for you.
- Never mention the agriculture officer or their number yourself; set needs_officer and a line is added for you. Leave needs_officer false for emergencies and greetings.`;

const PER_KG: Record<string, number> = { kg: 1, tonne: 1000, maund: 40 };
const PER_HA: Record<string, number> = { hectare: 1, acre: 0.40468564224 };

// Every tonnes-per-hectare figure in the guidance, converted once here so a
// yield-in-acres question needs no second model call.
const YIELD_CONVERSIONS = [
  ...new Set(GUIDANCE.flatMap((c) => [...c.text.matchAll(/([0-9.]+) tonnes per hectare/g)].map((m) => Number(m[1])))),
]
  .map((t) => `${t} tonnes per hectare = ${convertUnits(t, 't_per_ha', 'maund_per_acre')} maunds per acre`)
  .join('\n');

// Fixed per deploy, so every request starts with the same prefix and Gemini
// can reuse its cache across farmers and turns.
const SYSTEM = `${RULES}

Official guidance (cite by id):
${GUIDANCE.length ? GUIDANCE.map((c) => `[${c.id}] ${c.text}`).join('\n') : '(none loaded)'}

Yield conversions, computed exactly (1 maund = 40 kg). Use these instead of calling convert_units; say they are conversions:
${YIELD_CONVERSIONS}`;

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'get_weather',
    description:
      "4-day forecast: temperature, rain, rain chance, wind. Pass place when the question names a town or district; leave it out for the farmer's saved farm.",
    schema: { type: 'object', properties: { place: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'convert_units',
    description:
      'Exact unit conversion of one or more values in a single call. Units: hectare, acre, tonne, kg, maund (40 kg), t_per_ha, maund_per_acre.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['values', 'from', 'to'],
      properties: { values: { type: 'array', items: { type: 'number' } }, from: { type: 'string' }, to: { type: 'string' } },
    },
  },
  {
    name: 'reply',
    description: 'Send the final reply. Call exactly once, last.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'citations', 'topic', 'needs_officer', 'tone', 'spoken_language', 'punjabi_shahmukhi', 'spoken_text'],
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
        spoken_language: { type: 'string', enum: ['ur', 'pa'] },
        punjabi_shahmukhi: { type: 'string', description: 'Pakistani Punjabi reply in Shahmukhi when spoken_language is pa, else empty.' },
        spoken_text: { type: 'string', description: 'punjabi_shahmukhi in standard Gurmukhi spelling, else empty.' },
        tone: { type: 'string', enum: ['cheerful', 'warm', 'calm', 'concerned', 'urgent'], description: 'How the reply should sound when spoken.' },
      },
    },
  },
];


export function convertUnits(value: number, from: string, to: string): number | null {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (from in PER_KG && to in PER_KG) return round((value * PER_KG[from]!) / PER_KG[to]!);
  if (from in PER_HA && to in PER_HA) return round((value * PER_HA[from]!) / PER_HA[to]!);
  if (from === 't_per_ha' && to === 'maund_per_acre') return round(((value * 1000) / 40) * PER_HA.acre!);
  if (from === 'maund_per_acre' && to === 't_per_ha') return round((value * 40) / 1000 / PER_HA.acre!);
  return null;
}

const DIGITS = /[0-9۰-۹٠-٩੦-੯]+(?:[.,][0-9۰-۹٠-٩੦-੯]+)?/g;

function toAsciiDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[੦-੯]/g, (d) => String(d.charCodeAt(0) - 0x0a66));
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

interface Usage {
  input: number;
  cached: number;
  output: number;
  thinking: number;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface Provider {
  name: string;
  step(messages: unknown[]): Promise<{ calls: ToolCall[]; assistant: unknown; usage?: Usage }>;
  toolResults(results: { id: string; name: string; content: string }[]): unknown[];
  userMessage(text: string, photo: Photo | null): unknown;
  history(turns: Turn[]): unknown[];
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Gemini 3 attaches thought signatures to function calls; the model's turn
// must be sent back unmodified or the next step is rejected.
function gemini(env: Env): Provider {
  return {
    name: 'gemini',
    async step(messages) {
      const model = env.GEMINI_MODEL ?? 'gemini-flash-latest';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: messages,
          tools: [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }],
          toolConfig: { functionCallingConfig: { mode: 'ANY' } },
          generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
        }),
      });
      if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        candidates?: { content?: { role: string; parts?: { functionCall?: { id?: string; name: string; args?: Record<string, unknown> } }[] } }[];
        usageMetadata?: { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      };
      const u = json.usageMetadata ?? {};
      const usage = { input: u.promptTokenCount ?? 0, cached: u.cachedContentTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thinking: u.thoughtsTokenCount ?? 0 };
      const content = json.candidates?.[0]?.content;
      if (!content) throw new Error('gemini returned no content');
      const calls = (content.parts ?? [])
        .filter((p) => p.functionCall)
        .map((p, i) => ({ id: p.functionCall!.id ?? `${p.functionCall!.name}:${i}`, name: p.functionCall!.name, input: p.functionCall!.args ?? {} }));
      return { calls, assistant: content, usage };
    },
    toolResults: (results) => [
      {
        role: 'user',
        parts: results.map((r) => {
          const name = r.id.includes(':') ? r.id.split(':')[0]! : r.name;
          return { functionResponse: { ...(r.id.includes(':') ? {} : { id: r.id }), name, response: { content: r.content } } };
        }),
      },
    ],
    userMessage: (text, photo) => ({
      role: 'user',
      parts: [...(photo ? [{ inline_data: { mime_type: photo.mime, data: toBase64(photo.bytes) } }] : []), { text }],
    }),
    history: (turns) => turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
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
    history: (turns) => turns.map((t) => ({ role: t.role, content: t.content })),
  };
}

const MAX_STEPS = 10;

interface AgentContext {
  history: Turn[];
  message: string;
  photo: Photo | null;
  location: { lat: number; lon: number; name: string | null } | null;
}

async function runOnce(env: Env, p: Provider, ctx: AgentContext): Promise<AgentReply> {
    const where = ctx.location ? `Saved farm location: ${ctx.location.name ?? `${ctx.location.lat}, ${ctx.location.lon}`}.` : 'Saved farm location: none.';
  const start = ctx.history.length ? '' : ' This is the start of the conversation.';
  const messages: unknown[] = [...p.history(ctx.history), p.userMessage(`[${where}${start}]\n${ctx.message}`, ctx.photo)];
  const steps: string[] = [];
  // 1122 is Punjab's emergency service, named by the safety rule in the prompt.
  let toolOutputs = `${env.OFFICER_PHONE} 1122\n${YIELD_CONVERSIONS}`;
  let retried = false;
  const total: Usage = { input: 0, cached: 0, output: 0, thinking: 0 };
  const done = (r: Omit<AgentReply, 'steps'>): AgentReply => {
    steps.push(`calls=${callsMade} in=${total.input} cached=${total.cached} out=${total.output} think=${total.thinking}`);
    return { ...r, steps };
  };
  let callsMade = 0;

  for (let i = 0; i < MAX_STEPS; i++) {
    const { calls, assistant, usage } = await p.step(messages);
    callsMade++;
    if (usage) for (const k of Object.keys(total) as (keyof Usage)[]) total[k] += usage[k];
    messages.push(assistant);
    if (!calls.length) throw new Error('model made no tool call');

    const results: { id: string; name: string; content: string }[] = [];
    for (const call of calls) {
      steps.push(call.name);
      if (call.name === 'reply') {
        const input = call.input as AgentReplyInput;
        const check = verifyReply(
          { text: `${input.text}\n${input.spoken_language === 'pa' ? `${input.punjabi_shahmukhi ?? ''}\n${input.spoken_text ?? ''}` : ''}`, citations: input.citations },
          GUIDANCE,
          toolOutputs,
        );
        if (check.ok) return done(input);
        if (retried) throw new Error(`reply rejected twice: ${check.reason}`);
        retried = true;
        steps.push(`rejected: ${check.reason}`);
        results.push({
          id: call.id,
          name: call.name,
          content: `Not sent. ${check.reason}. If that number is a unit conversion, call convert_units and use its result. Otherwise copy quotes exactly from the guidance, and remove any number you cannot trace to a cited quote or a tool result. If the guidance does not support the claim, say it is not covered.`,
        });
        continue;
      }
      let out: string;
      if (call.name === 'get_weather') {
        const place = (call.input as { place?: string }).place?.trim();
        const where = place ? await findPlace(place).catch(() => null) : ctx.location;
        if (!where) out = place ? `Could not find ${place} in Pakistan.` : 'No location saved for this farmer.';
        else {
          const f = await forecast(where.lat, where.lon).catch(() => null);
          out = f ? `${place ? (where as { label: string }).label : 'Saved farm'}:\n${f}` : 'Forecast unavailable right now.';
        }
      } else if (call.name === 'convert_units') {
        const { values, from, to } = call.input as { values: number[]; from: string; to: string };
        out = (values ?? [])
          .map((v) => {
            const r = convertUnits(v, from, to);
            return r === null ? `Cannot convert ${from} to ${to}.` : `${v} ${from} = ${r} ${to}`;
          })
          .join('\n');
      } else {
        out = `Unknown tool ${call.name}.`;
      }
      toolOutputs += '\n' + out;
      results.push({ id: call.id, name: call.name, content: out });
    }
    messages.push(...p.toolResults(results));
  }
  throw new Error('agent ran out of steps');
}

// Groq cannot see photos, so a photo turn has only Gemini to try.
export async function runAgent(env: Env, ctx: AgentContext): Promise<AgentReply> {
  const providers: Provider[] = [];
  if (env.GEMINI_API_KEY) providers.push(gemini(env));
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
