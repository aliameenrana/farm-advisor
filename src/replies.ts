import type { Chunk } from './guidance.js';

// Each fixed reply has an Urdu and a Punjabi copy; the farmer gets the one
// matching the language they last spoke. Punjabi is written in Shahmukhi for
// the chat and Gurmukhi for the voice, since Gemini's Punjabi voice is pa-IN.
export interface Fixed {
  text: string;
  spoken: string;
}

export type Lang = 'ur' | 'pa';
type Copies = Record<Lang, Fixed>;
const urdu = (text: string): Fixed => ({ text, spoken: text });

export const FIXED: {
  locationSaved: Copies;
  unclear: Copies;
  unsupported: Copies;
  error: Copies;
  unknown: (officer: string) => Copies;
  typeIt: (officer: string) => Copies;
  tooLong: Copies;
  slowDown: Copies;
  photo: (officer: string) => Copies;
} = {
  locationSaved: {
    ur: urdu('شکریہ، آپ کے کھیت کی لوکیشن محفوظ ہو گئی۔ اب اپنا سوال آواز میں بھیجیں۔'),
    pa: {
      text: 'شکریہ، تہاڈے کھیت دی لوکیشن محفوظ ہو گئی اے۔ ہُن اپنا سوال بول کے بھیجو۔',
      spoken: 'ਸ਼ੁਕਰੀਆ, ਤੁਹਾਡੇ ਖੇਤ ਦੀ ਲੋਕੇਸ਼ਨ ਮਹਿਫ਼ੂਜ਼ ਹੋ ਗਈ ਏ। ਹੁਣ ਆਪਣਾ ਸਵਾਲ ਬੋਲ ਕੇ ਭੇਜੋ।',
    },
  },
  unclear: {
    ur: urdu('معاف کیجیے، آواز صاف سمجھ نہیں آئی۔ دوبارہ بھیج دیں، یا لکھ کر پوچھ لیں۔'),
    pa: {
      text: 'معاف کرنا، آواز صاف سمجھ نئیں آئی۔ فیر بھیج دیو، یا لکھ کے پچھ لوو۔',
      spoken: 'ਮਾਫ਼ ਕਰਨਾ, ਆਵਾਜ਼ ਸਾਫ਼ ਸਮਝ ਨਹੀਂ ਆਈ। ਫੇਰ ਭੇਜ ਦਿਓ, ਜਾਂ ਲਿਖ ਕੇ ਪੁੱਛ ਲਵੋ।',
    },
  },
  tooLong: {
    ur: urdu('یہ پیغام بہت لمبا ہے۔ اپنا سوال ایک منٹ سے کم میں بول کر بھیجیں۔'),
    pa: {
      text: 'ایہہ سنیہا بہت لمبا اے۔ اپنا سوال اک منٹ توں گھٹ وچ بول کے بھیجو۔',
      spoken: 'ਇਹ ਸੁਨੇਹਾ ਬਹੁਤ ਲੰਮਾ ਏ। ਆਪਣਾ ਸਵਾਲ ਇੱਕ ਮਿੰਟ ਤੋਂ ਘੱਟ ਵਿੱਚ ਬੋਲ ਕੇ ਭੇਜੋ।',
    },
  },
  slowDown: {
    ur: urdu('آپ نے بہت سارے پیغام بھیجے ہیں۔ تھوڑی دیر بعد دوبارہ پوچھیں۔'),
    pa: {
      text: 'تسیں بہت سارے سنیہے بھیجے نیں۔ تھوڑی دیر بعد فیر پچھو۔',
      spoken: 'ਤੁਸੀਂ ਬਹੁਤ ਸਾਰੇ ਸੁਨੇਹੇ ਭੇਜੇ ਨੇ। ਥੋੜ੍ਹੀ ਦੇਰ ਬਾਅਦ ਫੇਰ ਪੁੱਛੋ।',
    },
  },
  unsupported: {
    ur: urdu('میں صرف آواز، تصویر یا لکھا ہوا پیغام سمجھ سکتا ہوں۔'),
    pa: {
      text: 'میں صرف آواز، تصویر یا لکھیا ہویا سنیہا سمجھ سکدا آں۔',
      spoken: 'ਮੈਂ ਸਿਰਫ਼ ਆਵਾਜ਼, ਤਸਵੀਰ ਜਾਂ ਲਿਖਿਆ ਹੋਇਆ ਸੁਨੇਹਾ ਸਮਝ ਸਕਦਾ ਆਂ।',
    },
  },
  error: {
    ur: urdu('ابھی کچھ خرابی ہے۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔'),
    pa: {
      text: 'ہلے کجھ خرابی اے۔ تھوڑی دیر بعد فیر کوشش کرو۔',
      spoken: 'ਹਲੇ ਕੁਝ ਖ਼ਰਾਬੀ ਏ। ਥੋੜ੍ਹੀ ਦੇਰ ਬਾਅਦ ਫੇਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    },
  },
  unknown: (officer) => ({
    ur: urdu(`اس سوال کا جواب میرے پاس موجود سرکاری ہدایات میں نہیں ہے۔ براہِ کرم محکمہ زراعت کے افسر سے بات کریں: ${officer}`),
    pa: {
      text: `ایس سوال دا جواب میرے کول موجود سرکاری ہدایتاں وچ نئیں اے۔ مہربانی کر کے زراعت افسر نال گل کرو: ${officer}`,
      spoken: `ਏਸ ਸਵਾਲ ਦਾ ਜਵਾਬ ਮੇਰੇ ਕੋਲ ਮੌਜੂਦ ਸਰਕਾਰੀ ਹਿਦਾਇਤਾਂ ਵਿੱਚ ਨਹੀਂ ਏ। ਮਿਹਰਬਾਨੀ ਕਰਕੇ ਜ਼ਰਾਇਤ ਅਫ਼ਸਰ ਨਾਲ ਗੱਲ ਕਰੋ: ${officer}`,
    },
  }),
  typeIt: (officer) => ({
    ur: urdu(`آپ اپنا سوال لکھ کر بھیج دیں، یا زراعت افسر سے بات کریں: ${officer}`),
    pa: {
      text: `تسیں اپنا سوال لکھ کے بھیج دیو، یا زراعت افسر نال گل کرو: ${officer}`,
      spoken: `ਤੁਸੀਂ ਆਪਣਾ ਸਵਾਲ ਲਿਖ ਕੇ ਭੇਜ ਦਿਓ, ਜਾਂ ਜ਼ਰਾਇਤ ਅਫ਼ਸਰ ਨਾਲ ਗੱਲ ਕਰੋ: ${officer}`,
    },
  }),
  photo: (officer) => ({
    ur: urdu(`میں ابھی تصویر نہیں دیکھ سکتا۔ فصل میں جو مسئلہ نظر آ رہا ہے وہ آواز میں بتائیں۔ تصویر زراعت افسر کو بھی بھیج دیں: ${officer}`),
    pa: {
      text: `میں ہلے تصویر نئیں ویکھ سکدا۔ فصل وچ جیہڑا مسئلہ نظر آ رہیا اے، اوہ بول کے دسو۔ تصویر زراعت افسر نوں وی بھیج دیو: ${officer}`,
      spoken: `ਮੈਂ ਹਲੇ ਤਸਵੀਰ ਨਹੀਂ ਵੇਖ ਸਕਦਾ। ਫ਼ਸਲ ਵਿੱਚ ਜਿਹੜਾ ਮਸਲਾ ਨਜ਼ਰ ਆ ਰਿਹਾ ਏ, ਉਹ ਬੋਲ ਕੇ ਦੱਸੋ। ਤਸਵੀਰ ਜ਼ਰਾਇਤ ਅਫ਼ਸਰ ਨੂੰ ਵੀ ਭੇਜ ਦਿਓ: ${officer}`,
    },
  }),
};

export const OFFICER_LINE = {
  urdu: (officer: string) => `مزید رہنمائی کے لیے زراعت افسر سے رابطہ کریں: ${officer}`,
  punjabi: (officer: string) => `ਹੋਰ ਰਹਿਨੁਮਾਈ ਲਈ ਜ਼ਰਾਇਤ ਅਫ਼ਸਰ ਨਾਲ ਗੱਲ ਕਰੋ: ${officer}`,
};

export function sourceLine(sources: Chunk[]): string {
  const bySource = new Map<string, string[]>();
  for (const s of sources) {
    const pages = bySource.get(s.source) ?? [];
    if (!pages.includes(s.page)) pages.push(s.page);
    bySource.set(s.source, pages);
  }
  return 'ماخذ: ' + [...bySource].map(([source, pages]) => `${source}، ${pages.join('، ')}`).join('؛ ');
}
