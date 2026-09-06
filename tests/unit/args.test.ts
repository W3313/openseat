import { describe, expect, it } from 'vitest';
import { flagBool, flagList, flagString, normalizeArgv, readArgs } from '../../scripts/lib/args';

describe('scripts/lib/args', () => {
  it('reads `--name value`, `--name=value` and boolean flags', () => {
    const a = readArgs(['--school', 'uiuc', '--limit', '2', '--only-missing', '--subjects=CS,ECE', 'extra']);
    expect(flagString(a, 'school')).toBe('uiuc');
    expect(flagString(a, 'limit')).toBe('2');
    expect(flagBool(a, 'only-missing')).toBe(true);
    expect(flagList(a, 'subjects')).toEqual(['CS', 'ECE']);
    expect(a.positionals).toEqual(['extra']);
  });

  it('does not swallow a following flag as a value', () => {
    expect(normalizeArgv(['--force', '--limit', '3'])).toEqual(['--force', '--limit=3']);
    const a = readArgs(['--force', '--limit', '3']);
    expect(flagBool(a, 'force')).toBe(true);
    expect(flagString(a, 'limit')).toBe('3');
  });
});
