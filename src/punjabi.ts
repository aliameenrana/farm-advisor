// Indian Punjabi words the model can slip into Gurmukhi, mapped to what a
// Pakistani Punjabi speaker says. Longest first so phrases win over parts.
const PAKISTANI: [string, string][] = [
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
