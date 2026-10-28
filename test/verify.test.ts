import { describe, expect, it } from 'vitest';
import { verify, type ModelAnswer } from '../src/answer.js';
import type { Chunk } from '../src/guidance.js';

const chunks: Chunk[] = [
  { id: 'c1', source: 'Synthetic test source', page: 'p1', text: 'آلو کی بوائی اکتوبر کے دوسرے نصف میں کریں۔ فی ایکڑ 12 بوری بیج۔' },
];

const base: ModelAnswer = {
  status: 'answer',
  question: 'بوائی کب کریں؟',
  topic: 'sowing',
  answer: 'بوائی اکتوبر کے دوسرے نصف میں کریں۔',
  citations: [{ chunk_id: 'c1', quote: 'آلو کی بوائی اکتوبر کے دوسرے نصف میں کریں' }],
};

describe('verify', () => {
  it('accepts an answer quoting real chunk text', () => {
    expect(verify(base, chunks, null).ok).toBe(true);
  });

  it('rejects a quote the chunk does not contain', () => {
    const r = verify({ ...base, citations: [{ chunk_id: 'c1', quote: 'آلو کی بوائی نومبر میں کریں' }] }, chunks, null);
    expect(r.ok).toBe(false);
  });

  it('rejects a made-up chunk id', () => {
    expect(verify({ ...base, citations: [{ chunk_id: 'c9', quote: base.citations[0]!.quote }] }, chunks, null).ok).toBe(false);
  });

  it('rejects a number not in the cited quote, even if it is elsewhere in the chunk', () => {
    expect(verify({ ...base, answer: 'فی ایکڑ 12 بوری بیج ڈالیں۔' }, chunks, null).ok).toBe(false);
  });

  it('accepts a number from the cited quote written in Urdu digits', () => {
    const r = verify(
      { ...base, answer: 'فی ایکڑ ۱۲ بوری بیج ڈالیں۔', citations: [{ chunk_id: 'c1', quote: 'فی ایکڑ 12 بوری بیج' }] },
      chunks,
      null,
    );
    expect(r.ok).toBe(true);
  });

  it('does not let 2 pass because 12 is in the quote', () => {
    const r = verify(
      { ...base, answer: 'فی ایکڑ 2 بوری بیج۔', citations: [{ chunk_id: 'c1', quote: 'فی ایکڑ 12 بوری بیج' }] },
      chunks,
      null,
    );
    expect(r.ok).toBe(false);
  });

  it('rejects an answer with no citations', () => {
    expect(verify({ ...base, citations: [] }, chunks, null).ok).toBe(false);
  });
});
