import test from 'node:test';
import assert from 'node:assert/strict';
import { dayGoalToRecord, detachWorkspace, mergeWorkspace, noteToRecord, reconcileRemoteSchedules, recordToDayGoal, recordToNote, recordToSchedule, recordToTask, resolveConflict, scheduleToRecord, taskToRecord } from '../src/modules/sync/workspace.js';
import { decryptNote, generatePairingKeyPair, openPairingEnvelope, sealPairingEnvelope } from '../src/modules/sync/crypto.js';
import { acknowledgedDirtyIds } from '../src/modules/sync/pending.js';

test('desktop cards and notes map to the shared encrypted workspace contract', () => {
  const card = taskToRecord({ id: '42', title: '发布', category: 'work', column: 'doing', createdAt: '2026-09-15T00:00:00Z' });
  const note = noteToRecord({ id: 'n1', title: '方法', content: '# 正文', type: 'article', createdAt: '2026-09-15T00:00:00Z' });

  assert.equal(card.id, 'linuxdo-board:42');
  assert.equal(card.category, '工作');
  assert.equal(recordToTask(card).category, 'work');
  assert.equal(note.id, 'linuxdo-note:n1');
  assert.equal(recordToNote(note).content, '# 正文');
});

test('schedule and day-goal records are independent of their board card', () => {
  const schedule = {
    id: 'block-1', taskId: 'linuxdo-board:42', plannedStart: 1_000, plannedEnd: 3_601_000,
    status: 'pending', createdAt: '2026-09-16T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z',
  };
  const goal = { date: '2026-09-16', minutes: 450, updatedAt: '2026-09-16T00:00:00Z' };
  const blockRecord = scheduleToRecord(schedule);
  const goalRecord = dayGoalToRecord(goal);
  assert.equal(blockRecord.id, 'linuxdo-schedule:block-1');
  assert.equal(blockRecord.taskId, schedule.taskId);
  assert.equal(goalRecord.id, 'linuxdo-day-goal:2026-09-16');
  assert.equal(recordToSchedule(blockRecord).plannedEnd, schedule.plannedEnd);
  assert.equal(recordToDayGoal(goalRecord).minutes, 450);

  const merged = mergeWorkspace({ tasks: [], notes: [], schedules: [], dayGoals: [], tombstones: [] }, [blockRecord, goalRecord]);
  assert.equal(merged.notes.length, 0);
  assert.equal(merged.schedules[0].id, schedule.id);
  assert.equal(merged.dayGoals[0].date, goal.date);
  const detached = detachWorkspace(merged);
  assert.equal(detached.schedules[0].taskId, schedule.taskId);
  assert.equal(detached.schedules[0].serverVersion, undefined);
});

test('schedule and daily-goal conflict copies stay identifiable after synchronization', () => {
  const block = { id: 'copy', syncId: 'conflict:block', taskId: 'linuxdo-board:42',
    plannedStart: 1000, plannedEnd: 2000, status: 'pending', conflictOf: 'linuxdo-schedule:original' };
  const goal = { date: '2026-09-16', syncId: 'conflict:goal', minutes: 120,
    conflictOf: 'linuxdo-day-goal:2026-09-16' };
  assert.equal(recordToSchedule(scheduleToRecord(block)).conflictOf, block.conflictOf);
  assert.equal(recordToDayGoal(dayGoalToRecord(goal)).conflictOf, goal.conflictOf);
  const merged = mergeWorkspace({ tasks: [], notes: [], schedules: [], dayGoals: [], tombstones: [] },
    [scheduleToRecord(block), dayGoalToRecord(goal)]);
  assert.equal(merged.schedules[0].conflictOf, block.conflictOf);
  assert.equal(merged.dayGoals[0].conflictOf, goal.conflictOf);
});

test('unknown encrypted record types are not turned into knowledge notes', () => {
  const current = { tasks: [], notes: [], schedules: [], dayGoals: [], tombstones: [] };
  const merged = mergeWorkspace(current, [{ id: 'future:1', kind: 'future_kind', updatedAt: 3_000 }]);
  assert.deepEqual(merged, current);
});

test('newer remote records replace the current UI data and tombstones remove it', () => {
  const current = {
    tasks: [{ id: '42', title: '旧标题', category: 'work', createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:01:00Z' }],
    notes: [],
    tombstones: [],
  };
  const updated = taskToRecord(current.tasks[0], { title: '手机修改', updatedAt: Date.parse('2026-09-15T00:02:00Z'), syncState: 'clean' });
  const merged = mergeWorkspace(current, [updated]);
  assert.equal(merged.tasks[0].title, '手机修改');

  const deleted = mergeWorkspace(merged, [{ ...updated, trashedAt: Date.parse('2026-09-15T00:03:00Z'), updatedAt: Date.parse('2026-09-15T00:03:00Z') }]);
  assert.equal(deleted.tasks.length, 0);
  assert.equal(deleted.tombstones[0].id, 'linuxdo-board:42');
});

test('an older remote record cannot resurrect a locally deleted item', () => {
  const deletedAt = Date.parse('2026-09-15T00:03:00Z');
  const stale = taskToRecord({ id: '42', title: '旧远端标题', createdAt: '2026-09-15T00:00:00Z' }, {
    updatedAt: Date.parse('2026-09-15T00:02:00Z'),
    syncState: 'clean',
  });
  const tombstone = { ...stale, trashedAt: deletedAt, updatedAt: deletedAt };
  const merged = mergeWorkspace({ tasks: [], notes: [], tombstones: [tombstone] }, [stale]);

  assert.equal(merged.tasks.length, 0);
  assert.equal(merged.tombstones[0].id, 'linuxdo-board:42');
});

test('disconnecting keeps local content but removes metadata owned by the old vault', () => {
  const detached = detachWorkspace({
    tasks: [{ id: '42', title: '保留卡片', images: ['data:image/png;base64,AA=='], syncId: 'remote-card', syncAttachments: [{ id: 'blob' }], serverVersion: 9, syncState: 'clean' }],
    notes: [{ id: 'n1', title: '保留笔记', content: '正文', syncId: 'remote-note', serverVersion: 7, syncState: 'clean' }],
    tombstones: [{ id: 'deleted', serverVersion: 3 }],
  });

  assert.deepEqual(detached.tasks[0], { id: '42', title: '保留卡片', images: ['data:image/png;base64,AA=='] });
  assert.deepEqual(detached.notes[0], { id: 'n1', title: '保留笔记', content: '正文' });
  assert.deepEqual(detached.tombstones, []);
  assert.equal(taskToRecord(detached.tasks[0]).serverVersion, 0);
});

test('a higher server version wins even when the local device clock is ahead', () => {
  const local = recordToTask(taskToRecord({ id: '42', title: '本地旧版本' }, { updatedAt: 3_000, serverVersion: 1, syncState: 'clean' }));
  const remote = taskToRecord({ id: '42', title: '远端新版本' }, { updatedAt: 2_000, serverVersion: 2, syncState: 'clean' });
  const merged = mergeWorkspace({ tasks: [local], notes: [], tombstones: [] }, [remote]);

  assert.equal(merged.tasks[0].title, '远端新版本');
  assert.equal(merged.tasks[0].serverVersion, 2);
});

test('a protected local change is not overwritten before its outbox entry is acknowledged', () => {
  const local = recordToTask(taskToRecord({ id: '42', title: '尚未上传的本地编辑' }, { updatedAt: 3_000, serverVersion: 1 }));
  const remote = taskToRecord({ id: '42', title: '远端版本' }, { updatedAt: 4_000, serverVersion: 2, syncState: 'clean' });
  const merged = mergeWorkspace({ tasks: [local], notes: [], tombstones: [] }, [remote], new Map(), new Set(['linuxdo-board:42']));

  assert.equal(merged.tasks[0].title, '尚未上传的本地编辑');
  assert.equal(merged.tasks[0].serverVersion, 1);
});

test('remote completion cancels future plans without erasing executed history or reviving plans on reopen', () => {
  const now = Date.parse('2026-09-16T09:00:00Z');
  const task = { id: '42', title: '工作', column: 'doing', createdAt: new Date(now - 1000).toISOString() };
  const future = { id: 'future', taskId: 'linuxdo-board:42', plannedStart: now + 3_600_000,
    plannedEnd: now + 7_200_000, status: 'pending', createdAt: task.createdAt };
  const past = { ...future, id: 'past', plannedStart: now - 7_200_000, plannedEnd: now - 3_600_000,
    status: 'finished', actualStart: now - 7_200_000, actualEnd: now - 3_600_000 };
  const current = { tasks: [task], notes: [], schedules: [future, past], dayGoals: [], tombstones: [] };
  const done = taskToRecord(task, { boardColumn: 'done', updatedAt: now, serverVersion: 2 });
  const result = reconcileRemoteSchedules(mergeWorkspace(current, [done]), now);
  assert.equal(result.workspace.schedules[0].status, 'canceled');
  assert.equal(result.workspace.schedules[0].cancelReason, 'task_completed');
  assert.equal(result.workspace.schedules[1].status, 'finished');
  assert.deepEqual(result.changedRecords.map(record => record.id), ['linuxdo-schedule:future']);

  const reopened = taskToRecord(task, { boardColumn: 'doing', updatedAt: now + 1000, serverVersion: 3 });
  const next = reconcileRemoteSchedules(mergeWorkspace(result.workspace, [reopened]), now + 1000);
  assert.equal(next.workspace.schedules[0].status, 'canceled');
  assert.deepEqual(next.changedRecords, []);
});

test('a late offline completion still cancels blocks that were future when the task finished', () => {
  const completedAt = Date.parse('2026-09-16T09:00:00Z');
  const task = { id: '42', title: '工作', column: 'doing', createdAt: new Date(completedAt - 1000).toISOString() };
  const block = { id: 'ten', taskId: 'linuxdo-board:42', plannedStart: completedAt + 3_600_000,
    plannedEnd: completedAt + 7_200_000, status: 'pending', createdAt: task.createdAt };
  const current = { tasks: [task], notes: [], schedules: [block], dayGoals: [], tombstones: [] };
  const done = taskToRecord(task, { boardColumn: 'done', updatedAt: completedAt, serverVersion: 2 });
  const result = reconcileRemoteSchedules(mergeWorkspace(current, [done]), completedAt + 2 * 3_600_000);
  assert.equal(result.workspace.schedules[0].status, 'canceled');
  assert.deepEqual(result.changedRecords.map(record => record.id), ['linuxdo-schedule:ten']);
});

test('editing a completed task later does not move the completion boundary', () => {
  const completedAt = Date.parse('2026-09-16T09:00:00Z');
  const task = { id: '42', title: '工作', column: 'doing', createdAt: new Date(completedAt - 1000).toISOString() };
  const block = { id: 'ten', taskId: 'linuxdo-board:42', plannedStart: completedAt + 3_600_000,
    plannedEnd: completedAt + 7_200_000, status: 'pending', createdAt: task.createdAt };
  const current = { tasks: [task], notes: [], schedules: [block], dayGoals: [], tombstones: [] };
  const edited = taskToRecord(task, { boardColumn: 'done', completedAt, updatedAt: completedAt + 2 * 3_600_000, serverVersion: 3 });
  assert.equal(recordToTask(edited).completedAt, completedAt);
  const result = reconcileRemoteSchedules(mergeWorkspace(current, [edited]), completedAt + 3 * 3_600_000);
  assert.equal(result.workspace.schedules[0].status, 'canceled');
});

test('remote task deletion removes schedules even when the tombstone arrived before the block', () => {
  const now = Date.parse('2026-09-16T09:00:00Z');
  const task = { id: '42', title: '已删除', column: 'todo', createdAt: new Date(now - 1000).toISOString() };
  const block = { id: 'future', taskId: 'linuxdo-board:42', plannedStart: now + 3_600_000,
    plannedEnd: now + 7_200_000, status: 'pending', createdAt: task.createdAt };
  const tombstone = taskToRecord(task, { trashedAt: now, updatedAt: now, serverVersion: 2 });
  const current = { tasks: [task], notes: [], schedules: [block], dayGoals: [], tombstones: [] };
  const removed = reconcileRemoteSchedules(mergeWorkspace(current, [tombstone]), now);
  assert.deepEqual(removed.workspace.tasks, []);
  assert.deepEqual(removed.workspace.schedules, []);
  assert.equal(removed.changedRecords[0].trashedAt, now);

  const orphan = { tasks: [], notes: [], schedules: [], dayGoals: [], tombstones: [tombstone] };
  const late = reconcileRemoteSchedules(mergeWorkspace(orphan, [scheduleToRecord(block)]), now + 1000);
  assert.deepEqual(late.workspace.schedules, []);
  assert.equal(late.changedRecords[0].id, 'linuxdo-schedule:future');
  assert.equal(late.changedRecords[0].trashedAt, now + 1000);
});

test('unresolved schedule without a task or deletion tombstone remains available for later sync', () => {
  const current = { tasks: [], notes: [], schedules: [], dayGoals: [], tombstones: [] };
  const block = { id: 'waiting', taskId: 'linuxdo-board:42', plannedStart: 1000,
    plannedEnd: 2000, status: 'pending', createdAt: '2026-09-16T00:00:00Z' };
  const result = reconcileRemoteSchedules(mergeWorkspace(current, [scheduleToRecord(block)]), 500);
  assert.equal(result.workspace.schedules.length, 1);
  assert.deepEqual(result.changedRecords, []);
});

test('a revision created during sync is not cleared by the older pending snapshot', () => {
  const id = 'linuxdo-board:42';
  const dirty = new Map([[id, 2]]);
  const queued = new Map([[id, 2]]);
  const queuedAtStart = new Map([[id, 1]]);

  assert.deepEqual(acknowledgedDirtyIds(dirty, queued, queuedAtStart, new Map(), new Set()), []);
  assert.deepEqual(acknowledgedDirtyIds(new Map([[id, 1]]), new Map([[id, 1]]), queuedAtStart, new Map(), new Set()), [id]);
});

test('delete versus edit keeps the deletion and exposes the remote edit as a conflict copy', () => {
  const deleted = taskToRecord({ id: '42', title: '删除前内容' }, { trashedAt: 3_000, updatedAt: 3_000, serverVersion: 1, syncState: 'pending' });
  const edited = taskToRecord({ id: '42', title: '另一设备编辑' }, { updatedAt: 2_500, serverVersion: 2, syncState: 'clean' });
  const resolution = resolveConflict(deleted, edited, 4_000, 'conflict-copy');

  assert.equal(resolution.primary.trashedAt, 3_000);
  assert.equal(resolution.retry.serverVersion, 2);
  assert.equal(resolution.conflict.id, 'conflict-copy');
  assert.equal(resolution.conflict.title, '另一设备编辑（冲突副本）');
  assert.equal(resolution.conflict.trashedAt, null);
});

test('desktop crypto reads the shared Android and Web board-card fixture', async () => {
  const record = await decryptNote(
    Uint8Array.from({ length: 32 }, (_, index) => index),
    'vault-test',
    'board-shared',
    {
      encryption_version: 1,
      nonce: 'AAECAwQFBgcICQoL',
      ciphertext: 'PCC/f+ff4HniIOXvnJoQDPGz4xbcWTQVVgPHvz8Lb9NzdPGfzrN2uliGC4T8600a1HuIOvIxCHXaGov+kWTXwtJeqR6q8xxDXTrOHIDmasjcMkdCIQYxSBh4LyvsWFwiTR7PYYZt6mnrcVPTOgwDRZhFTomFqkn+KI1196DEQizVPXSj4K67Nirbas9SringGtaQQVRl5jmuZcoTiLOPmrG7vGaGir4dwjavlv26pJmx7L5D7NhRhj79JVf9IxpWMRGm2H20uKdSMvHczjOs4c1cmhlcct6yHv3vqi9qtdgnTL3BgQIvBzEmzG3Sfg4oiqmbkCqVbRiLSUtR/+4j8ny0ltHp+HJQArMeK5VOSG+7wK+pwf+jlUAfXWEm1s87ZWKqLd6EujWoDgpqOrmCsuy+Oj0h+ap57EI/LMxgODWjKUBz3iCJzY2GfUR37Wg=',
    },
  );
  assert.equal(record.title, '跨端卡片');
  assert.equal(record.boardColumn, 'doing');
});

test('pairing envelope transfers vault credentials to the generated device key', async () => {
  const receiver = await generatePairingKeyPair();
  const credentials = { vaultId: 'vault-a', vaultKey: 'key', deviceToken: 'token' };
  const sealed = await sealPairingEnvelope(receiver.publicKey, credentials);
  assert.deepEqual(await openPairingEnvelope(receiver.privateKey, sealed), credentials);
});
