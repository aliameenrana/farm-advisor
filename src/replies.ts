import type { Chunk } from './guidance.js';

export const REPLY = {
  welcome:
    'السلام علیکم۔ میں آلو کی کاشت کے بارے میں سرکاری ہدایات سے مشورہ دیتا ہوں۔ اپنا سوال آواز میں بھیجیں۔ موسم کے مطابق مشورے کے لیے ایک بار اپنے کھیت کی لوکیشن بھیج دیں۔',
  locationSaved: 'شکریہ، آپ کے کھیت کی لوکیشن محفوظ ہو گئی۔ اب اپنا سوال آواز میں بھیجیں۔',
  unclear: 'معاف کیجیے، آپ کی بات صاف سمجھ نہیں آئی۔ براہِ کرم دوبارہ آہستہ اور صاف بول کر بھیجیں۔',
  unknown: (officer: string) =>
    `اس سوال کا جواب میرے پاس موجود سرکاری ہدایات میں نہیں ہے۔ براہِ کرم محکمہ زراعت کے افسر سے بات کریں: ${officer}`,
  unsupported: 'میں صرف آواز، تصویر یا لکھا ہوا پیغام سمجھ سکتا ہوں۔',
  error: 'ابھی کچھ خرابی ہے۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔',
  readLabel: 'دوا یا کھاد استعمال کرنے سے پہلے اس کا لیبل ضرور پڑھیں۔',
  photo: (officer: string) =>
    `میں ابھی تصویر نہیں دیکھ سکتا۔ فصل میں جو مسئلہ نظر آ رہا ہے وہ آواز میں بتائیں۔ تصویر زراعت افسر کو بھی بھیج دیں: ${officer}`,
  officerPunjabi: (officer: string) => `ਹੋਰ ਰਾਹਨੁਮਾਈ ਲਈ ਖੇਤੀਬਾੜੀ ਅਫ਼ਸਰ ਨਾਲ ਗੱਲ ਕਰੋ: ${officer}`,
  officer: (officer: string) => `مزید رہنمائی کے لیے زراعت افسر سے رابطہ کریں: ${officer}`,
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
