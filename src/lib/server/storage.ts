import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { SavedData } from '../types.ts';
import { parseSummary } from './validation.ts';

export const dataDir = resolve('data');

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function saveJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  await rename(temporary, path);
}

export async function readSavedData(): Promise<SavedData> {
  try {
    return { summary: parseSummary(await readJson(resolve(dataDir, 'summary.json'))), error: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { summary: null, error: 'No saved matches yet. Run bun run fetch, then reload.' };
    }
    return { summary: null, error: 'Saved history could not be read. Check data/summary.json or rerun bun run fetch. Existing files were kept.' };
  }
}
