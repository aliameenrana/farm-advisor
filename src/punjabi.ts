// Fixes applied to Gurmukhi before it is spoken: misspelled place names,
// then Indian Punjabi words mapped to what a Pakistani speaker says.
// Longer entries come first so phrases win over their parts.
const PAKISTANI: [string, string][] = [
  // Letter-by-letter spellings that make the voice add vowels, e.g. Gujranaawala.
  ['ਗੁਜਰਾਨਵਾਲ', 'ਗੁਜਰਾਂਵਾਲ'],
  ['ਗੋਜਰਾਨਵਾਲ', 'ਗੁਜਰਾਂਵਾਲ'],
  ['ਗੋਜਰਾਂਵਾਲ', 'ਗੁਜਰਾਂਵਾਲ'],
  ['ਸਾਹਿਵਾਲ', 'ਸਾਹੀਵਾਲ'],
  ['ਓਕਾੜਹ', 'ਓਕਾੜਾ'],
  ['ਦੇਪਾਲਪੁਰ', 'ਦੀਪਾਲਪੁਰ'],
  ['ਕਿਰਪਾ ਕਰਕੇ', 'ਮਿਹਰਬਾਨੀ ਕਰਕੇ'],
  ['ਕ੍ਰਿਪਾ ਕਰਕੇ', 'ਮਿਹਰਬਾਨੀ ਕਰਕੇ'],
  ['ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'ਅੱਸਲਾਮੁ ਅਲੈਕੁਮ'],
  ['ਖੇਤੀਬਾੜੀ', 'ਜ਼ਰਾਇਤ'],
  ['ਧੰਨਵਾਦ', 'ਸ਼ੁਕਰੀਆ'],
  ['ਸਮੱਸਿਆ', 'ਮਸਲਾ'],
  ['ਜਾਣਕਾਰੀ', 'ਮਾਲੂਮਾਤ'],
  ['ਉਤਪਾਦਨ', 'ਪੈਦਾਵਾਰ'],
  ['ਨਮਸਤੇ', 'ਅੱਸਲਾਮੁ ਅਲੈਕੁਮ'],
  ['ਵਿਭਾਗ', 'ਮਹਿਕਮਾ'],
  ['ਸੁਝਾਅ', 'ਮਸ਼ਵਰਾ'],
  ['ਕਿਰਪਾ', 'ਮਿਹਰਬਾਨੀ'],
  ['ਪ੍ਰਤੀ', 'ਫ਼ੀ'],
  ['ਉਪਜ', 'ਪੈਦਾਵਾਰ'],
  ['ਸਮਾਂ', 'ਵੇਲਾ'],
];

export function pakistaniPunjabi(gurmukhi: string): { text: string; replaced: string[] } {
  const replaced: string[] = [];
  let text = gurmukhi;
  for (const [indian, pakistani] of PAKISTANI) {
    if (text.includes(indian)) {
      text = text.split(indian).join(pakistani);
      replaced.push(indian);
    }
  }
  return { text, replaced };
}
