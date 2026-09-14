import test from 'node:test';
import assert from 'node:assert/strict';
import { detachWorkspace, mergeWorkspace, noteToRecord, recordToNote, recordToTask, resolveConflict, taskToRecord } from '../src/modules/sync/workspace.js';
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
