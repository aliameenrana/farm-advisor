import type { Env } from './env.js';

export interface Transcript {
  text: string;
  // Mean Whisper avg_logprob over segments; closer to 0 is more certain.
  confidence: number;
  noSpeech: boolean;
}

interface Segment {
  avg_logprob: number;
  no_speech_prob: number;
}

// Whisper's Punjabi output tends toward Gurmukhi script; asking for Urdu gets
// Perso-Arabic text the answer model and the log can both use.
export async function transcribe(env: Env, audio: ArrayBuffer, language = 'ur'): Promise<Transcript | null> {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/ogg' }), 'note.ogg');
  form.append('model', 'whisper-large-v3');
  form.append('language', language);
  form.append('response_format', 'verbose_json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    console.error('whisper failed', res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { text?: string; segments?: Segment[] };
  const segments = json.segments ?? [];
  const text = json.text?.trim() ?? '';
  if (!segments.length) return { text, confidence: -Infinity, noSpeech: true };

  const confidence = segments.reduce((s, x) => s + x.avg_logprob, 0) / segments.length;
  const noSpeech = segments.every((x) => x.no_speech_prob > 0.6);
  return { text, confidence, noSpeech };
}
