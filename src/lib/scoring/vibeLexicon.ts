// SPEC 8.9 vibe lexicon: 6–12 lowercase phrases per tag, matched on word boundaries in normalizeText(text).
// Phrases are written the way students write reviews; keep them concrete so a tag is a quote, not a guess.
import type { VibeTag } from '@/lib/domain/types';

export const VIBE_LEXICON: Record<VibeTag, readonly string[]> = {
  'clear-lectures': [
    'clear lectures', 'clear lecturer', 'explains clearly', 'explains things clearly', 'explains well',
    'explains everything', 'easy to follow', 'easy to understand', 'very clear', 'lectures are clear',
    'great at explaining', 'breaks things down',
  ],
  engaging: [
    'engaging', 'entertaining', 'funny', 'hilarious', 'never boring', 'keeps you interested',
    'passionate', 'enthusiastic', 'makes it interesting', 'fun lectures', 'lively',
  ],
  caring: [
    'cares about students', 'really cares', 'genuinely cares', 'caring', 'very kind', 'super kind',
    'approachable', 'always willing to help', 'wants you to succeed', 'goes out of his way', 'goes out of her way',
    'goes out of their way',
  ],
  'fair-grading': [
    'fair grading', 'grades fairly', 'fair grader', 'fair exams', 'exams are fair', 'tests are fair',
    'reasonable exams', 'graded fairly', 'very fair', 'fair tests', 'no surprises on exams',
  ],
  'curves-generously': [
    'curve', 'curved', 'curves', 'generous curve', 'generous grading', 'bumps grades', 'grades generously',
    'lenient grading', 'easy to get an a', 'easy a', 'bumped my grade', 'big curve',
  ],
  'great-notes': [
    'great notes', 'great slides', 'good notes', 'good slides', 'posts slides', 'posts notes', 'posts the notes',
    'notes are great', 'slides are great', 'lecture notes are', 'detailed notes', 'well organized slides',
  ],
  'heavy-homework': [
    'so much homework', 'lots of homework', 'tons of homework', 'too much homework', 'weekly problem sets',
    'heavy workload', 'tons of assignments', 'lots of assignments', 'a lot of work', 'so much work',
    'huge workload', 'time consuming',
  ],
  'hard-exams': [
    'hard exams', 'exams are hard', 'exams were hard', 'brutal exams', 'brutal tests', 'tests are hard',
    'difficult exams', 'exams are brutal', 'impossible exams', 'tricky exams', 'exam averages were low',
    'hard tests',
  ],
  'fast-paced': [
    'fast paced', 'fast pace', 'goes fast', 'moves fast', 'moves quickly', 'goes too fast', 'rushes through',
    'rushed', 'hard to keep up', 'covers a lot', 'breakneck',
  ],
  disorganized: [
    'disorganized', 'disorganised', 'unorganized', 'all over the place', 'scattered', 'messy', 'chaotic',
    'no structure', 'unclear expectations', 'confusing lectures', 'hard to follow', 'poorly organized',
  ],
  'strict-attendance': [
    'attendance is mandatory', 'mandatory attendance', 'takes attendance', 'attendance counts', 'attendance matters',
    'strict attendance', 'attendance policy', 'iclicker', 'clicker points', 'attendance quizzes', 'must attend',
    'required attendance',
  ],
  'must-read-textbook': [
    'read the textbook', 'read the book', 'textbook is required', 'textbook is necessary', 'need the textbook',
    'buy the textbook', 'reading is essential', 'reading heavy', 'lots of reading', 'tons of reading',
    'do the readings', 'exams come from the textbook',
  ],
};
