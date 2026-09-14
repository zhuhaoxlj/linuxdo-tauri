import assert from 'node:assert/strict';
import test from 'node:test';
import { internalPath } from '../src/modules/linuxdo/lib/api.js';

test('LinuxDo topic links map to app topic routes', () => {
  assert.equal(internalPath('https://linux.do/t/topic/2817831'), '/linuxdo/topic/2817831');
  assert.equal(internalPath('https://linux.do/t/topic/2817831/7'), '/linuxdo/topic/2817831/7');
});

test('app hash links stay inside the Tauri app', () => {
  assert.equal(internalPath('#/linuxdo/topic/2817831'), '/linuxdo/topic/2817831');
  assert.equal(internalPath('tauri://localhost#/linuxdo/topic/2817831'), '/linuxdo/topic/2817831');
});

test('foreign Tauri URLs are not treated as internal links', () => {
  assert.equal(internalPath('tauri://evil#/linuxdo/topic/2817831'), null);
  assert.equal(internalPath('#/board'), null);
});
