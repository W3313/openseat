// SPEC 6.6 / 6.7 / 12.3: each rankings/*.json < 200 KB; professors-detail.json < 2 MB; data/processed/uiuc < 8 MB.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROCESSED = path.join(process.cwd(), 'data', 'processed', 'uiuc');
const RANKINGS = path.join(PROCESSED, 'rankings');

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(full) : statSync(full).size;
  }
  return total;
}

describe('committed processed data size budget', () => {
  it('has at least one rankings payload', () => {
    const files = readdirSync(RANKINGS).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('keeps every rankings/<SUBJECT>.json under 200 KB', () => {
    for (const file of readdirSync(RANKINGS).filter((f) => f.endsWith('.json'))) {
      const size = statSync(path.join(RANKINGS, file)).size;
      expect(size, `${file} is ${size} bytes`).toBeLessThan(200 * 1024);
    }
  });

  it('keeps professors-detail.json under 2 MB', () => {
    const size = statSync(path.join(PROCESSED, 'professors-detail.json')).size;
    expect(size).toBeLessThan(2 * 1024 * 1024);
  });

  it('keeps data/processed/uiuc under 8 MB in total', () => {
    expect(dirBytes(PROCESSED)).toBeLessThan(8 * 1024 * 1024);
  });
});
