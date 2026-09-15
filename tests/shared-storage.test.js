import test from 'node:test';
import assert from 'node:assert/strict';
import { isSharedKey, planSharedSync } from '../src/shared/sharedStorage.js';

const file = (seededBy, entries) => ({ seededBy, entries });

test('只有应用自己的键参与开发版/正式版共享', () => {
  for (const key of ['fluxdo:settings', 'fluxdo:drafts:lindum', 'board-data-v1', 'linuxdo-auth']) {
    assert.equal(isSharedKey(key), true, key);
  }
  for (const key of ['', 'settings', '__mbLastAjax', 'linuxdo-auth-backup', 'fluxdo']) {
    assert.equal(isSharedKey(key), false, key);
  }
});

test('没有共享文件时用本机数据播种', () => {
  const plan = planSharedSync({ file: null, local: { 'fluxdo:settings': '{"a":1}' }, mode: 'build' });
  assert.deepEqual(plan.entries, { 'fluxdo:settings': '{"a":1}' });
  assert.equal(plan.seededBy, 'build');
  assert.equal(plan.saveFile, true);
  assert.deepEqual(plan.applyToLocal, {});
});

test('dev 播种的文件在正式版启动时以正式版数据重新播种', () => {
  const plan = planSharedSync({
    file: file('dev', { 'fluxdo:settings': 'dev-value', 'fluxdo:history:lindum': 'dev-only' }),
    local: { 'fluxdo:settings': 'build-value', 'board-data-v1': '{"tasks":[]}' },
    mode: 'build',
  });
  // 两边都有的键以正式版为准，dev 独有的键保留，正式版独有的键补进来
  assert.deepEqual(plan.entries, {
    'fluxdo:settings': 'build-value',
    'fluxdo:history:lindum': 'dev-only',
    'board-data-v1': '{"tasks":[]}',
  });
  assert.equal(plan.seededBy, 'build');
  assert.equal(plan.saveFile, true);
  // 正式版本机就是基准，不需要写回本机
  assert.deepEqual(plan.applyToLocal, {});
  // 被覆盖的 dev 值留一份备份
  assert.deepEqual(plan.backup, { 'fluxdo:settings': 'dev-value' });
});

test('文件是正式版播种时 dev 以文件为准并保留本机独有的键', () => {
  const plan = planSharedSync({
    file: file('build', { 'fluxdo:settings': 'build-value', 'board-data-v1': 'board' }),
    local: { 'fluxdo:settings': 'dev-stale', 'fluxdo:drafts:lindum': '{}' },
    mode: 'dev',
  });
  assert.deepEqual(plan.applyToLocal, { 'fluxdo:settings': 'build-value', 'board-data-v1': 'board' });
  assert.deepEqual(plan.backup, { 'fluxdo:settings': 'dev-stale' });
  assert.deepEqual(plan.entries, {
    'fluxdo:settings': 'build-value',
    'board-data-v1': 'board',
    'fluxdo:drafts:lindum': '{}',
  });
  assert.equal(plan.saveFile, true);
  assert.equal(plan.seededBy, 'build');
});

test('两边一致时不写文件也不备份', () => {
  const plan = planSharedSync({
    file: file('build', { 'fluxdo:settings': 'same', 'board-data-v1': 'same' }),
    local: { 'fluxdo:settings': 'same', 'board-data-v1': 'same' },
    mode: 'dev',
  });
  assert.equal(plan.saveFile, false);
  assert.deepEqual(plan.applyToLocal, {});
  assert.deepEqual(plan.backup, {});
  assert.equal(plan.seededBy, 'build');
});

test('正式版重复启动不会改写已有文件', () => {
  const plan = planSharedSync({
    file: file('build', { 'fluxdo:settings': 'value' }),
    local: { 'fluxdo:settings': 'value' },
    mode: 'build',
  });
  assert.equal(plan.saveFile, false);
  assert.deepEqual(plan.entries, { 'fluxdo:settings': 'value' });
});
