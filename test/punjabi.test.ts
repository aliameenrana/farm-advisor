import { describe, expect, it } from 'vitest';
import { pakistaniPunjabi } from '../src/punjabi.js';

describe('pakistaniPunjabi', () => {
  it('replaces prati with fi in a yield sentence', () => {
    const r = pakistaniPunjabi('ਪੈਦਾਵਾਰ 35 ਟਨ ਪ੍ਰਤੀ ਹੈਕਟੇਅਰ ਏ।');
    expect(r.text).toBe('ਪੈਦਾਵਾਰ 35 ਟਨ ਫ਼ੀ ਹੈਕਟੇਅਰ ਏ।');
    expect(r.replaced).toEqual(['ਪ੍ਰਤੀ']);
  });

  it('replaces the whole phrase before its parts', () => {
    expect(pakistaniPunjabi('ਕਿਰਪਾ ਕਰਕੇ ਫੇਰ ਭੇਜੋ').text).toBe('ਮਿਹਰਬਾਨੀ ਕਰਕੇ ਫੇਰ ਭੇਜੋ');
  });

  it('leaves Pakistani Punjabi untouched', () => {
    const t = 'ਸ਼ੁਕਰੀਆ, ਮਿਹਰਬਾਨੀ ਕਰਕੇ ਜ਼ਰਾਇਤ ਅਫ਼ਸਰ ਨਾਲ ਗੱਲ ਕਰੋ।';
    expect(pakistaniPunjabi(t)).toEqual({ text: t, replaced: [] });
  });
});

describe('place names', () => {
  it('fixes the letter-by-letter Gujranwala that the voice reads as Gujranaawala', () => {
    expect(pakistaniPunjabi('ਗੁਜਰਾਨਵਾਲੇ ਲਈ').text).toBe('ਗੁਜਰਾਂਵਾਲੇ ਲਈ');
  });
});

describe('whole words only', () => {
  it('leaves qismaan alone even though it contains the letters of samaan', () => {
    const r = pakistaniPunjabi('ਦੋ ਕਿਸਮਾਂ ਦੀ ਸਿਫ਼ਾਰਸ਼ ਏ');
    expect(r).toEqual({ text: 'ਦੋ ਕਿਸਮਾਂ ਦੀ ਸਿਫ਼ਾਰਸ਼ ਏ', replaced: [] });
  });

  it('does not touch a word that merely starts with an Indian word', () => {
    expect(pakistaniPunjabi('ਪ੍ਰਤੀਕ').text).toBe('ਪ੍ਰਤੀਕ');
  });
});
