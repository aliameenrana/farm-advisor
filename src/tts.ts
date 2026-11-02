import type { Env } from './env.js';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

// Returns null when no speech key is configured; the text reply still goes out.
export async function speakUrdu(env: Env, text: string): Promise<ArrayBuffer | null> {
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
    console.error('tts failed', res.status, await res.text());
    return null;
  }
  return res.arrayBuffer();
}
