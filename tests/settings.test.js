import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, mergeSettings, settingsVersion } from '../src/modules/linuxdo/lib/settings.js';

test('全新安装时评论默认使用树形视图', () => {
  const settings = mergeSettings({});
  assert.equal(settings.nestedView, true);
  assert.equal(defaultSettings.nestedView, true);
  assert.equal(settings.settingsVersion, settingsVersion);
});

test('旧版本设置（无 settingsVersion）升级后默认开启树形视图', () => {
  const legacy = { theme: 'dark', fontSize: 18, nestedView: false, nestedLineStyle: 'straight' };
  const settings = mergeSettings(legacy);
  assert.equal(settings.nestedView, true);
  assert.equal(settings.settingsVersion, settingsVersion);
  // 其它用户设置保持不变
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.fontSize, 18);
  assert.equal(settings.nestedLineStyle, 'straight');
});

test('已迁移过的设置尊重用户自己关闭树形视图的选择', () => {
  const stored = { ...defaultSettings, nestedView: false };
  const settings = mergeSettings(stored);
  assert.equal(settings.nestedView, false);
});

test('mergeSettings 容忍损坏或缺失的本地数据', () => {
  for (const broken of [null, undefined, 'nested', 42]) {
    const settings = mergeSettings(broken);
    assert.equal(settings.nestedView, true);
    assert.equal(settings.fontSize, defaultSettings.fontSize);
  }
});
