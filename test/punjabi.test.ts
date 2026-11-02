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
