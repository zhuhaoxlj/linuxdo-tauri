import assert from 'node:assert/strict';
import test from 'node:test';
import { addSubtask, deleteSubtask, editSubtask, normalizeSubtasks, reorderSubtask, shiftSubtask, subtaskProgress, toggleSubtask } from '../src/modules/board/lib/tasks.js';

test('normalizeSubtasks tolerates legacy strings and junk values', () => {
  assert.deepEqual(normalizeSubtasks(undefined), []);
  assert.deepEqual(normalizeSubtasks('nope'), []);
  const list = normalizeSubtasks(['第一条', { title: '第二条', done: true }, null]);
  assert.deepEqual(list.map(item => [item.title, item.done]), [['第一条', false], ['第二条', true], ['', false]]);
  assert.equal(new Set(list.map(item => item.id)).size, 3);
});

test('addSubtask ignores blank titles and appends in order', () => {
  const one = addSubtask([], '  写需求  ');
  assert.equal(one.length, 1);
  assert.equal(one[0].title, '写需求');
  assert.equal(one[0].done, false);
  assert.equal(addSubtask(one, '   '), null);
  const two = addSubtask(one, '画原型');
  assert.deepEqual(two.map(item => item.title), ['写需求', '画原型']);
});

test('toggleSubtask flips done state and stamps doneAt', () => {
  const [item] = addSubtask([], '联调接口');
  const done = toggleSubtask([item], item.id);
  assert.equal(done[0].done, true);
  assert.ok(done[0].doneAt);
  const undone = toggleSubtask(done, item.id);
  assert.equal(undone[0].done, false);
  assert.equal(undone[0].doneAt, null);
  assert.deepEqual(toggleSubtask([item], 'missing')[0], item);
});

test('editSubtask renames without dropping the checklist state', () => {
  const list = addSubtask(addSubtask([], 'A'), 'B');
  const done = toggleSubtask(list, list[1].id);
  const renamed = editSubtask(done, list[1].id, { title: ' B2 ' });
  assert.equal(renamed[1].title, 'B2');
  assert.equal(renamed[1].done, true);
  assert.equal(editSubtask(done, list[1].id, { title: '  ' })[1].title, 'B');
});

test('deleteSubtask removes only the requested item', () => {
  const list = addSubtask(addSubtask([], 'A'), 'B');
  assert.deepEqual(deleteSubtask(list, list[0].id).map(item => item.title), ['B']);
  assert.equal(subtaskProgress(list).total, 2);
  assert.equal(subtaskProgress(toggleSubtask(list, list[0].id)).done, 1);
});

test('reorderSubtask moves an item before or after its target', () => {
  const list = addSubtask(addSubtask(addSubtask([], 'A'), 'B'), 'C');
  const [a, b, c] = list;
  assert.deepEqual(reorderSubtask(list, c.id, a.id, 'before').map(item => item.title), ['C', 'A', 'B']);
  assert.deepEqual(reorderSubtask(list, a.id, c.id, 'after').map(item => item.title), ['B', 'C', 'A']);
  assert.deepEqual(reorderSubtask(list, a.id, c.id, 'before').map(item => item.title), ['B', 'A', 'C']);
  // 自拖、无效 id、缺参数都保持原顺序
  assert.deepEqual(reorderSubtask(list, b.id, b.id).map(item => item.title), ['A', 'B', 'C']);
  assert.deepEqual(reorderSubtask(list, 'missing', a.id).map(item => item.title), ['A', 'B', 'C']);
  assert.deepEqual(reorderSubtask(list, a.id, 'missing').map(item => item.title), ['A', 'B', 'C']);
});

test('shiftSubtask nudges by one position and stops at the edges', () => {
  const list = addSubtask(addSubtask(addSubtask([], 'A'), 'B'), 'C');
  const [a, b, c] = list;
  assert.deepEqual(shiftSubtask(list, b.id, -1).map(item => item.title), ['B', 'A', 'C']);
  assert.deepEqual(shiftSubtask(list, b.id, 1).map(item => item.title), ['A', 'C', 'B']);
  assert.deepEqual(shiftSubtask(list, a.id, -1).map(item => item.title), ['A', 'B', 'C']);
  assert.deepEqual(shiftSubtask(list, c.id, 1).map(item => item.title), ['A', 'B', 'C']);
});
