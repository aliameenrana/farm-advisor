import { Mp3Encoder } from '@breezystack/lamejs';
import type { Env } from './env.js';

export interface Speech {
  bytes: ArrayBuffer;
  mime: string;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

async function azure(env: Env, text: string): Promise<Speech | null> {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) return null;
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ur-PK"><voice name="ur-PK-AsadNeural">` +
    `<prosody rate="-10%">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'ogg-48khz-16bit-mono-opus',
      // Azure answers 400 without a User-Agent, which Workers' fetch does not send.
      'User-Agent': 'farm-advisor',
    },
    body: ssml,
  });
  if (!res.ok) {
    console.error('azure tts failed', res.status, await res.text());
    return null;
  }
  return { bytes: await res.arrayBuffer(), mime: 'audio/ogg' };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Gemini returns raw 16-bit PCM and a Worker cannot run ffmpeg, so it is
// encoded to MP3 in JS. WhatsApp plays MP3 as an audio file, not a voice note.
export function pcmToMp3(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const encoder = new Mp3Encoder(1, sampleRate, 48);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += 1152) {
    const out = encoder.encodeBuffer(samples.subarray(i, i + 1152));
    if (out.length) chunks.push(new Uint8Array(out));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(new Uint8Array(tail));
  const mp3 = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    mp3.set(c, offset);
    offset += c.length;
  }
  return mp3.buffer;
}

async function gemini(env: Env, text: string): Promise<Speech | null> {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Read this aloud in Urdu with a Pakistani accent, slowly, warm and clear, like advice to a farmer:\n${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_TTS_VOICE ?? 'Charon' } } },
      },
    }),
  });
  if (!res.ok) {
    console.error('gemini tts failed', res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
  const audio = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!audio) {
    console.error('gemini tts returned no audio');
    return null;
  }
  const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] ?? 24000);
  return { bytes: pcmToMp3(base64ToBytes(audio.data), rate), mime: 'audio/mpeg' };
}

const PROVIDERS = { gemini, azure } as const;
type ProviderName = keyof typeof PROVIDERS;

// TTS_PROVIDER picks the first voice to try; the other is the fallback.
// Null means no voice could be made, and the text reply still goes out.
export async function speak(env: Env, text: string): Promise<Speech | null> {
  const order: ProviderName[] = env.TTS_PROVIDER === 'azure' ? ['azure', 'gemini'] : ['gemini', 'azure'];
  for (const name of order) {
    const speech = await PROVIDERS[name](env, text).catch((err) => {
      console.error(`${name} tts threw`, err);
      return null;
    });
    if (speech) return speech;
  }
  return null;
}

// Only fixed replies go through here. Their words never change, so each
// is synthesised once per voice setting and replayed from D1 after that.
export async function speakCached(env: Env, text: string): Promise<Speech | null> {
  const config = env.TTS_PROVIDER === 'azure' ? 'azure:ur-PK-AsadNeural' : `gemini:${env.GEMINI_TTS_MODEL}:${env.GEMINI_TTS_VOICE}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${config}\n${text}`));
  const key = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const hit = await env.DB.prepare('SELECT mime, audio FROM tts_cache WHERE key = ?').bind(key).first<{ mime: string; audio: number[] | ArrayBuffer }>();
  if (hit) {
    const bytes = hit.audio instanceof ArrayBuffer ? hit.audio : new Uint8Array(hit.audio).buffer;
    return { bytes, mime: hit.mime };
  }
  const speech = await speak(env, text);
  if (speech) {
    await env.DB.prepare('INSERT OR REPLACE INTO tts_cache (key, mime, audio) VALUES (?,?,?)')
      .bind(key, speech.mime, speech.bytes)
      .run()
      .catch((err) => console.error('tts cache write failed', err));
  }
  return speech;
}
