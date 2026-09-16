import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceQueue, retainConcurrentNoteEdits } from '../src/modules/board/lib/workspaceQueue.js';

test('workspace edits wait for persistence without overwriting earlier changes', async () => {
  const queue = createWorkspaceQueue();
  let release;
  const disk = new Promise(resolve => { release = resolve; });
  const workspace = { tasks: [], schedules: [] };
  const saving = queue.run(async () => {
    await disk;
    workspace.schedules.push('morning');
  });
  const editing = queue.run(() => { workspace.tasks.push('updated task'); });
  const arranging = queue.run(() => { workspace.schedules.push('evening'); });
  assert.deepEqual(workspace, { tasks: [], schedules: [] });
  release();
  await Promise.all([saving, editing, arranging]);
  assert.deepEqual(workspace, { tasks: ['updated task'], schedules: ['morning', 'evening'] });
});

test('failed persistence does not block later edits', async () => {
  const queue = createWorkspaceQueue();
  const failed = queue.run(() => { throw new Error('disk full'); });
  const recovered = queue.run(() => 42);
  await assert.rejects(failed, /disk full/);
  assert.equal(await recovered, 42);
  await queue.idle();
});

test('a confirmed remote merge retains remote notes unless the editor changed locally during the write', () => {
  const before = [{ id: 'note', title: 'old' }, { id: 'other', title: 'old other' }];
  const remote = [{ id: 'note', title: 'remote' }, { id: 'other', title: 'remote other' }];
  const edited = [{ id: 'note', title: 'typing now' }, before[1]];
  const next = { notes: remote, schedules: ['plan'] };
  assert.equal(retainConcurrentNoteEdits(next, before, before), next);
  assert.deepEqual(retainConcurrentNoteEdits(next, before, edited), {
    notes: [edited[0], remote[1]], schedules: ['plan'],
  });
});
