// courseLevel() must read the level from each school's numbering scheme (3-, 4- and 5-digit catalog numbers).
import { describe, expect, it } from 'vitest';
import { courseLevel } from '@/lib/utils/ids';

describe('courseLevel', () => {
  it('keeps the hundreds for 3-digit numbers (UIUC, UCSB) and clamps to 100–500', () => {
    expect(courseLevel('101')).toBe(100);
    expect(courseLevel('225')).toBe(200);
    expect(courseLevel('598')).toBe(500);
    expect(courseLevel('799')).toBe(500);
    expect(courseLevel('1')).toBe(100);
    expect(courseLevel('99')).toBe(100);
  });
  it('uses the first digit of 4-digit (UH, UTD) and 5-digit (Purdue) numbers', () => {
    expect(courseLevel('1301')).toBe(100);
    expect(courseLevel('2305')).toBe(200);
    expect(courseLevel('4V95')).toBe(400);
    expect(courseLevel('6375')).toBe(500);
    expect(courseLevel('18000')).toBe(100);
    expect(courseLevel('38100')).toBe(300);
    expect(courseLevel('59000')).toBe(500);
  });
  it('skips letter prefixes and falls back to 100 for non-numeric input', () => {
    expect(courseLevel('W120A')).toBe(100);
    expect(courseLevel('CS130H')).toBe(100);
    expect(courseLevel('E371')).toBe(300);
    expect(courseLevel('ES 1-99')).toBe(100);
    expect(courseLevel('')).toBe(100);
    expect(courseLevel('ABC')).toBe(100);
  });
});
