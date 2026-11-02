import { describe, expect, it } from 'vitest';
import { convertUnits, verifyReply } from '../src/agent.js';
import type { Chunk } from '../src/guidance.js';

const chunks: Chunk[] = [
  { id: 'c1', source: 'Synthetic test source', page: 'p1', text: 'آلو کی بوائی اکتوبر کے دوسرے نصف میں کریں۔ فی ایکڑ 12 بوری بیج۔ Average yield 25.8 tonnes per hectare.' },
];
const cite = (quote: string) => [{ chunk_id: 'c1', quote }];

describe('verifyReply', () => {
  it('accepts a reply quoting real chunk text', () => {
    expect(verifyReply({ text: 'بوائی اکتوبر کے دوسرے نصف میں کریں۔', citations: cite('آلو کی بوائی اکتوبر کے دوسرے نصف میں کریں') }, chunks, '').ok).toBe(true);
  });

  it('accepts a greeting with no citations and no numbers', () => {
    expect(verifyReply({ text: 'وعلیکم السلام، آلو کے بارے میں پوچھیں۔', citations: [] }, chunks, '').ok).toBe(true);
  });

  it('rejects a number in an uncited reply', () => {
    expect(verifyReply({ text: 'فی ایکڑ 12 بوری بیج ڈالیں۔', citations: [] }, chunks, '').ok).toBe(false);
  });

  it('rejects a quote the chunk does not contain', () => {
    expect(verifyReply({ text: 'نومبر میں بوائی کریں۔', citations: cite('آلو کی بوائی نومبر میں کریں') }, chunks, '').ok).toBe(false);
  });

  it('rejects a made-up chunk id', () => {
    expect(verifyReply({ text: 'x', citations: [{ chunk_id: 'c9', quote: 'آلو کی بوائی اکتوبر کے دوسرے' }] }, chunks, '').ok).toBe(false);
  });

  it('accepts a number from the cited quote written in Urdu digits', () => {
    expect(verifyReply({ text: 'فی ایکڑ ۱۲ بوری بیج ڈالیں۔', citations: cite('فی ایکڑ 12 بوری بیج') }, chunks, '').ok).toBe(true);
  });

  it('does not let 2 pass because 12 is in the quote', () => {
    expect(verifyReply({ text: 'فی ایکڑ 2 بوری بیج۔', citations: cite('فی ایکڑ 12 بوری بیج') }, chunks, '').ok).toBe(false);
  });

  it('does not let 25 pass because 25.8 is in the quote', () => {
    expect(verifyReply({ text: 'پیداوار 25 ٹن ہے۔', citations: cite('Average yield 25.8 tonnes per hectare') }, chunks, '').ok).toBe(false);
  });

  it('accepts a decimal from the quote', () => {
    expect(verifyReply({ text: 'پیداوار 25.8 ٹن فی ہیکٹر ہے۔', citations: cite('Average yield 25.8 tonnes per hectare') }, chunks, '').ok).toBe(true);
  });

  it('accepts numbers from a tool result such as the forecast', () => {
    expect(verifyReply({ text: 'کل بارش کا امکان 70 فیصد ہے۔', citations: [] }, chunks, '2026-11-03: 14–24°C, rain 3 mm (chance 70%)').ok).toBe(true);
  });
});

describe('convertUnits', () => {
  it('converts tonnes per hectare to maunds per acre', () => {
    expect(convertUnits(25.8, 't_per_ha', 'maund_per_acre')).toBe(261.02);
  });
  it('round-trips maunds per acre back to tonnes per hectare', () => {
    expect(convertUnits(261.02, 'maund_per_acre', 't_per_ha')).toBe(25.8);
  });
  it('refuses mixed dimensions', () => {
    expect(convertUnits(1, 'acre', 'kg')).toBeNull();
  });
});
