import assert from 'node:assert/strict';
import test from 'node:test';
import { sortPinnedTasks } from '../src/modules/board/lib/tasks.js';

test('pinned cards sort before ordinary cards without mutating manual order', () => {
  const tasks = [
    { id: 'first' },
    { id: 'pinned-first', pinned: true },
    { id: 'second', pinned: false },
    { id: 'pinned-second', pinned: true },
  ];
  const original = [...tasks];
  assert.deepEqual(sortPinnedTasks(tasks).map(task => task.id), ['pinned-first', 'pinned-second', 'first', 'second']);
  assert.deepEqual(tasks, original);
  assert.deepEqual(sortPinnedTasks(tasks.map(task => ({ ...task, pinned: false }))).map(task => task.id),
    original.map(task => task.id));
});

test('pinning respects category and column boundaries', () => {
  const tasks = [
    { id: 'first', category: 'home', column: 'inbox' },
    { id: 'other-category', category: 'work', column: 'inbox', pinned: true },
    { id: 'other-column', category: 'home', column: 'done', pinned: true },
    { id: 'pinned', category: 'home', column: 'inbox', pinned: true },
  ];
  const ordered = sortPinnedTasks(tasks.filter(task => task.category === 'home'));
  assert.deepEqual(ordered.filter(task => task.column === 'inbox').map(task => task.id), ['pinned', 'first']);
  assert.deepEqual(ordered.filter(task => task.column === 'done').map(task => task.id), ['other-column']);
});
