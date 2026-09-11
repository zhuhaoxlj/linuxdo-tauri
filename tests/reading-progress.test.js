import assert from 'node:assert/strict';
import test from 'node:test';
import { readingProgress } from '../src/lib/readingProgress.js';

test('reading progress follows the furthest visible post', () => {
  assert.deepEqual(readingProgress([17, 18], 22), {
    currentPost: 18,
    progress: 18 / 22 * 100,
  });
});

test('reading progress is bounded for missing or oversized post numbers', () => {
  assert.deepEqual(readingProgress([], 22), { currentPost: 1, progress: 1 / 22 * 100 });
  assert.deepEqual(readingProgress([30], 22), { currentPost: 30, progress: 100 });
});
