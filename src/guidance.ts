import chunks from '../guidance/chunks.json';

export interface Chunk {
  id: string;
  source: string;
  page: string;
  url?: string;
  text: string;
}

export const GUIDANCE = chunks as Chunk[];

export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[\s‌‏]+/g, ' ')
    .trim()
    .toLowerCase();
}
