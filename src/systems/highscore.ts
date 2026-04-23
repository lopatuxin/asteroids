import { SCORING } from '../config';

export interface ScoreEntry {
  name: string;
  score: number;
  date: string;
}

export interface SubmitResult {
  accepted: boolean;
  position: number | null;
}

const STORAGE_KEY = SCORING.HIGHSCORE_STORAGE_KEY;
const TOP_N = SCORING.HIGHSCORE_TABLE_SIZE;
const NAME_LENGTH = SCORING.HIGHSCORE_NAME_LENGTH;

function normalizeName(raw: string): string {
  let name = (raw || '').toUpperCase();
  let result = '';
  for (let i = 0; i < name.length && result.length < NAME_LENGTH; i++) {
    const ch = name.charAt(i);
    if (ch >= 'A' && ch <= 'Z') result += ch;
    else result += 'A';
  }
  while (result.length < NAME_LENGTH) result += 'A';
  return result;
}

function isValidEntry(e: unknown): e is ScoreEntry {
  if (!e || typeof e !== 'object') return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    obj.name.length === NAME_LENGTH &&
    typeof obj.score === 'number' &&
    Number.isFinite(obj.score) &&
    typeof obj.date === 'string'
  );
}

export class HighScoreStorage {
  load(): ScoreEntry[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      if (!parsed.every(isValidEntry)) return [];
      const sorted = [...(parsed as ScoreEntry[])].sort((a, b) => b.score - a.score);
      return sorted.slice(0, TOP_N);
    } catch {
      return [];
    }
  }

  trySubmit(score: number, name: string): SubmitResult {
    if (!Number.isFinite(score)) return { accepted: false, position: null };
    const entry: ScoreEntry = {
      name: normalizeName(name),
      score,
      date: new Date().toISOString(),
    };
    const current = this.load();
    const combined: ScoreEntry[] = [...current, entry];
    combined.sort((a, b) => b.score - a.score);
    const top = combined.slice(0, TOP_N);
    const idx = top.indexOf(entry);
    if (idx === -1) return { accepted: false, position: null };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(top));
      return { accepted: true, position: idx };
    } catch {
      return { accepted: false, position: null };
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
