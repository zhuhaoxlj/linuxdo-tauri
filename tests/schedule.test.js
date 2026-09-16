import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelFutureBlocks, dateBounds, dayKey, daySegments, intervalMinutes, layoutSegments, snapToQuarter,
} from '../src/modules/board/lib/schedule.js';

test('a cross-midnight block is split between two local dates', () => {
  const block = {
    plannedStart: new Date(2026, 8, 16, 23, 30).getTime(),
    plannedEnd: new Date(2026, 8, 17, 0, 30).getTime(),
    status: 'pending',
  };
  assert.equal(daySegments([block], '2026-09-16')[0].end - daySegments([block], '2026-09-16')[0].start, 30 * 60_000);
  assert.equal(daySegments([block], '2026-09-17')[0].end - daySegments([block], '2026-09-17')[0].start, 30 * 60_000);
  assert.equal(dayKey(new Date(block.plannedStart)), '2026-09-16');
});

test('overlapping planned minutes count only once and canceled blocks do not count', () => {
  const start = dateBounds('2026-09-16').start;
  const blocks = [
    { plannedStart: start + 60_000 * 60, plannedEnd: start + 120 * 60_000, status: 'pending' },
    { plannedStart: start + 90 * 60_000, plannedEnd: start + 150 * 60_000, status: 'running' },
    { plannedStart: start, plannedEnd: start + 180 * 60_000, status: 'canceled' },
  ];
  assert.equal(intervalMinutes(daySegments(blocks, '2026-09-16')), 90);
  assert.deepEqual(layoutSegments(daySegments(blocks, '2026-09-16')).map(item => [item.lane, item.lanes]), [[0, 2], [1, 2]]);
});

test('day bounds follow the local calendar across daylight saving changes', () => {
  const spring = dateBounds('2026-03-08');
  assert.equal(dayKey(new Date(spring.start)), '2026-03-08');
  assert.equal(dayKey(new Date(spring.end)), '2026-03-09');
  assert.equal(snapToQuarter(new Date(2026, 8, 16, 10, 23).getTime()), new Date(2026, 8, 16, 10, 30).getTime());
});

test('completing a task cancels only future pending blocks', () => {
  const blocks = [
    { id: 'past', taskId: 'card:1', plannedStart: 500, status: 'pending' },
    { id: 'future', taskId: 'card:1', plannedStart: 2_000, status: 'pending' },
    { id: 'running', taskId: 'card:1', plannedStart: 2_000, status: 'running' },
    { id: 'other', taskId: 'card:2', plannedStart: 2_000, status: 'pending' },
  ];
  const next = cancelFutureBlocks(blocks, 'card:1', 1_000);
  assert.equal(next.find(block => block.id === 'future').status, 'canceled');
  assert.equal(next.find(block => block.id === 'future').cancelReason, 'task_completed');
  assert.equal(next.find(block => block.id === 'past').status, 'pending');
  assert.equal(next.find(block => block.id === 'running').status, 'running');
  assert.equal(next.find(block => block.id === 'other').status, 'pending');
});
