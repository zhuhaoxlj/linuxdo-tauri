import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATEGORY_NAME_MAX,
  DEFAULT_CATEGORIES,
  mergeCategories,
  normalizeCategoryIcon,
  normalizeCategoryName,
  updateCategoryList,
  taskBoardCategories,
  reorderCategoryList,
} from '../src/modules/board/lib/categories.js';

test('merge overlays stored names and icons onto default boards', () => {
  const merged = mergeCategories([
    { id: 'home', name: ' 今日焦点 ', icon: '🚀✨' },
    { id: 'unknown', name: '忽略', icon: '❌' },
  ]);
  assert.equal(merged.find(item => item.id === 'home').name, '今日焦点');
  assert.equal(merged.find(item => item.id === 'home').icon, '🚀');
  assert.equal(merged.find(item => item.id === 'life').name, '生活');
  assert.equal(merged.some(item => item.id === 'unknown'), false);
  assert.equal(merged.length, DEFAULT_CATEGORIES.length);
});

test('empty or oversized names fall back or truncate', () => {
  assert.equal(normalizeCategoryName('   ', '首页'), '首页');
  assert.equal(normalizeCategoryName('  工作台  ', '工作'), '工作台');
  assert.equal(normalizeCategoryName('a'.repeat(CATEGORY_NAME_MAX + 5), '工作').length, CATEGORY_NAME_MAX);
});

test('icons keep a single grapheme and reject blanks', () => {
  assert.equal(normalizeCategoryIcon('👨‍💻 extra', '🏠'), '👨‍💻');
  assert.equal(normalizeCategoryIcon('   ', '🏠'), '🏠');
});

test('updateCategoryList only rewrites the requested board', () => {
  const next = updateCategoryList(DEFAULT_CATEGORIES, 'work', { name: '项目', icon: '🎯' });
  assert.equal(next.find(item => item.id === 'work').name, '项目');
  assert.equal(next.find(item => item.id === 'work').icon, '🎯');
  assert.equal(next.find(item => item.id === 'home').name, '首页');
});

test('task boards exclude the current board and non-kanban pages', () => {
  const targets = taskBoardCategories(DEFAULT_CATEGORIES, 'home');
  assert.deepEqual(targets.map(item => item.id), ['life', 'work', 'knowledge', 'entertainment']);
});

test('merge keeps stored board order and appends missing defaults', () => {
  const merged = mergeCategories([
    { id: 'entertainment' },
    { id: 'home', name: '首页' },
    { id: 'unknown' },
  ]);
  assert.deepEqual(merged.map(item => item.id), ['entertainment', 'home', 'life', 'work', 'knowledge', 'sync', 'linuxdo']);
});

test('reorderCategoryList inserts before or after the drop target', () => {
  const ids = () => DEFAULT_CATEGORIES.map(item => item.id);
  assert.deepEqual(reorderCategoryList(DEFAULT_CATEGORIES, 'home', 'home', 'after').map(item => item.id), ids());
  assert.deepEqual(
    reorderCategoryList(DEFAULT_CATEGORIES, 'entertainment', 'home', 'before').map(item => item.id),
    ['entertainment', 'home', 'life', 'work', 'knowledge', 'sync', 'linuxdo'],
  );
  assert.deepEqual(
    reorderCategoryList(DEFAULT_CATEGORIES, 'home', 'life', 'after').map(item => item.id),
    ['life', 'home', 'work', 'knowledge', 'sync', 'entertainment', 'linuxdo'],
  );
});
