import { describe, expect, it } from 'vitest';
import { runAgent, type Turn } from '../src/agent.js';
import type { Env } from '../src/env.js';

// Spends real Gemini tokens (about 5 calls), so it runs only with a key:
//   GEMINI_API_KEY=... npx vitest run test/live.test.ts
const key = process.env.GEMINI_API_KEY;
const env = { GEMINI_API_KEY: key, GROQ_API_KEY: '', GEMINI_MODEL: 'gemini-flash-latest', OFFICER_PHONE: '+920000000000' } as unknown as Env;
const gujranwala = { lat: 32.16, lon: 74.19, name: 'Gujranwala, Punjab' };

describe.skipIf(!key)('live conversation with Gemini', () => {
  it('follows a five-turn conversation that leans on earlier turns', { timeout: 120_000 }, async () => {
    const history: Turn[] = [];
    const ask = async (message: string) => {
      const r = await runAgent(env, { history: history.slice(-6), message, photo: null, location: gujranwala });
      history.push({ role: 'user', content: message }, { role: 'assistant', content: r.text });
      console.log(`\n> ${message}\n< ${r.text}\n  [${r.steps.join(' > ')}]`);
      return r;
    };

    const varieties = await ask('میرے علاقے میں آلو کی کون سی قسم لگاؤں؟');
    expect(varieties.text).toMatch(/سیالکوٹ ریڈ/);
    expect(varieties.text).toMatch(/ایس ایچ/);

    const yieldOf = await ask('دوسری والی کی پیداوار کتنی ہے؟');
    expect(yieldOf.text).toMatch(/35/);

    const maunds = await ask('یہ ایکڑ میں من کے حساب سے بتاؤ');
    expect(maunds.text).toMatch(/354/);

    const fertiliser = await ask('اور اس کو کھاد کتنی ڈالوں؟');
    expect(fertiliser.needs_officer).toBe(true);
    expect(fertiliser.text).not.toMatch(/\d+\s*(بوری|کلو)/);

    const elsewhere = await ask('اور ساہیوال میں کون سی قسمیں لگتی ہیں؟');
    expect(elsewhere.text).toMatch(/ساہیوال ریڈ|ساہیوال وائٹ/);
  });

  it('chats generally, covers other crops, and follows up', { timeout: 120_000 }, async () => {
    const history: Turn[] = [];
    const ask = async (message: string) => {
      const r = await runAgent(env, { history: history.slice(-6), message, photo: null, location: gujranwala });
      history.push({ role: 'user', content: message }, { role: 'assistant', content: r.text });
      console.log(`\n> ${message}\n< ${r.text}\n  [${r.steps.join(' > ')}] cites: ${r.citations.map((c) => c.chunk_id).join(',')}`);
      return r;
    };

    const hello = await ask('السلام علیکم');
    expect(hello.text).toMatch(/ڈیمو|demo/i);

    const chat = await ask('آج بڑی سردی ہے، آپ کا کیا حال ہے؟');
    expect(chat.text).not.toMatch(/معلومات نہیں|نہیں بتا سکتا/);

    const smog = await ask('یہ سموگ کیا ہوتی ہے؟');
    expect(smog.text.length).toBeGreaterThan(20);

    const wheat = await ask('گندم کب بوئیں؟');
    expect(wheat.citations.some((c) => c.chunk_id === 'demo-wheat-sowing')).toBe(true);

    const seed = await ask('اور اس کا بیج کتنا ڈالیں؟');
    expect(seed.citations.some((c) => c.chunk_id === 'demo-wheat-seed-rate')).toBe(true);
  });
});
