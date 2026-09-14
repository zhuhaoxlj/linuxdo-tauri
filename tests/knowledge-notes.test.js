import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNoteTree, createNoteDraft, exportNoteMarkdown, filterNotes, formatNoteDate, noteExcerpt, noteFolder, noteTitle, parseTags, readingStats, safeSourceUrl, sortNotes } from '../src/modules/knowledge/lib/notes.js';

const notes = [
  { id: 'first', title: '阅读笔记', content: '记录认知与思考', folder: '学习/阅读', tags: ['方法论'], updatedAt: '2026-09-01T10:00:00Z' },
  { id: 'pinned', title: '实践总结', content: 'TypeScript 类型推导', summary: '一次开发复盘', folder: '学习/前端', tags: ['TypeScript', '开发'], updatedAt: '2026-08-01T10:00:00Z', pinned: true },
  { id: 'latest', title: '日常灵感', content: '关于专注的想法', folder: '生活', tags: ['方法论'], updatedAt: '2026-09-12T10:00:00Z' },
];

test('note templates are editable, independent, and not persisted as fake content', () => {
  const blank = createNoteDraft();
  assert.equal(blank.title, '');
  assert.equal(blank.content, '');
  assert.equal(blank.status, 'draft');
  assert.match(createNoteDraft('summary').content, /## 经验与总结/);
  assert.match(createNoteDraft('article', '阅读摘录').content, /## 我的思考/);
  assert.equal(createNoteDraft('article', '阅读摘录').folder, '阅读摘录');
  assert.equal(createNoteDraft('unknown').type, 'note');
  blank.tags.push('测试');
  assert.deepEqual(createNoteDraft().tags, []);
});

test('folder paths are normalized without changing the stored note', () => {
  const note = { title: '  标题  ', folder: ' / 学习 / 前端 // React / ' };
  assert.equal(noteTitle(note), '标题');
  assert.equal(noteFolder(note), '学习/前端/React');
  assert.equal(note.folder, ' / 学习 / 前端 // React / ');
  assert.equal(noteFolder({}), '未分类');
  assert.equal(noteTitle({ title: '   ' }), '未命名笔记');
});

test('tags accept Chinese commas, strip hash prefixes, and deduplicate', () => {
  assert.deepEqual(parseTags(' #阅读，方法论, 阅读\n开发 '), ['阅读', '方法论', '开发']);
  assert.deepEqual(parseTags([' 阅读 ', '#方法论', '阅读']), ['阅读', '方法论']);
  assert.deepEqual(parseTags(), []);
});

test('sort preserves the original order and supports recent-first independently of pinning', () => {
  assert.deepEqual(sortNotes(notes).map(note => note.id), ['pinned', 'latest', 'first']);
  assert.deepEqual(sortNotes(notes, false).map(note => note.id), ['latest', 'first', 'pinned']);
  assert.deepEqual(notes.map(note => note.id), ['first', 'pinned', 'latest']);
  assert.deepEqual(sortNotes([{ title: '乙' }, { title: '甲' }]).map(note => note.title), ['甲', '乙']);
});

test('search matches title, content, summary, folder, and tags case-insensitively', () => {
  assert.deepEqual(filterNotes(notes, { query: 'typescript 复盘' }).map(note => note.id), ['pinned']);
  assert.deepEqual(filterNotes(notes, { query: '阅读 认知' }).map(note => note.id), ['first']);
  assert.deepEqual(filterNotes(notes, { query: '生活 方法论' }).map(note => note.id), ['latest']);
  assert.deepEqual(filterNotes(notes, { query: '不存在' }), []);
  assert.equal(filterNotes(notes, { query: '  ' }).length, 3);
});

test('folder filters include descendants but not similarly named neighboring folders', () => {
  const list = [...notes, { id: 'outside', folder: '学习计划' }];
  assert.deepEqual(filterNotes(list, { folder: '学习' }).map(note => note.id), ['pinned', 'first']);
  assert.deepEqual(filterNotes(list, { folder: '学习/阅读' }).map(note => note.id), ['first']);
});

test('tag and pinned filters are exact and compose with search', () => {
  assert.deepEqual(filterNotes(notes, { tag: '方法论' }).map(note => note.id), ['latest', 'first']);
  assert.deepEqual(filterNotes(notes, { tag: '方法' }), []);
  assert.deepEqual(filterNotes(notes, { view: 'pinned', query: '开发' }).map(note => note.id), ['pinned']);
  assert.deepEqual(filterNotes(notes, { view: 'recent' }).map(note => note.id), ['latest', 'first', 'pinned']);
});

test('directory trees retain root notes and count descendants without mutating notes', () => {
  const snapshot = JSON.stringify(notes);
  const tree = buildNoteTree([...notes, { id: 'root', folder: '学习' }, { id: 'loose' }]);
  const learning = tree.find(node => node.path === '学习');
  assert.equal(learning.count, 3);
  assert.equal(learning.children.length, 2);
  assert.equal(learning.notes[0].id, 'root');
  assert.equal(learning.children.find(node => node.name === '前端').notes[0].id, 'pinned');
  assert.equal(tree.find(node => node.path === '未分类').count, 1);
  assert.deepEqual(buildNoteTree([]), []);
  assert.equal(JSON.stringify(notes), snapshot);
});

test('reading estimates count Chinese characters and Latin words', () => {
  assert.deepEqual(readingStats('知识沉淀 hello world'), { words: 6, minutes: 1 });
  assert.deepEqual(readingStats('知'.repeat(601)), { words: 601, minutes: 3 });
  assert.deepEqual(readingStats(), { words: 0, minutes: 1 });
});

test('excerpts prefer the user summary and remove presentation-only Markdown syntax', () => {
  assert.equal(noteExcerpt({ summary: '  核心观点  ', content: '## 标题' }), '核心观点');
  assert.equal(noteExcerpt({ content: '## 标题\n\n**重点** [链接](https://example.com)\n```js\nsecret();\n```' }), '标题 重点 链接');
  assert.equal(noteExcerpt({ content: '知'.repeat(150) }).length, 120);
});

test('source URLs allow only explicit web URLs', () => {
  assert.equal(safeSourceUrl('https://example.com/article'), 'https://example.com/article');
  assert.equal(safeSourceUrl('http://localhost:1420'), 'http://localhost:1420/');
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', '//example.com', 'not a url', '']) {
    assert.equal(safeSourceUrl(value), '');
  }
});

test('Markdown export retains article content, provenance, and organization', () => {
  const result = exportNoteMarkdown({ ...notes[0], summary: '核心观点\n补充说明', type: 'article', status: 'ready', createdAt: '2026-09-01T09:00:00Z', sourceUrl: 'https://example.com/article' });
  assert.match(result, /^# 阅读笔记\n\n> 核心观点\n> 补充说明\n\n记录认知与思考/);
  for (const text of ['目录：学习/阅读', '类型：文章', '状态：已整理', '标签：#方法论', '2026-09-01T09:00:00Z', '来源：https://example.com/article']) assert.ok(result.includes(text));
  assert.ok(!exportNoteMarkdown({ sourceUrl: 'javascript:alert(1)' }).includes('javascript:'));
  assert.equal(formatNoteDate('invalid'), '尚未记录');
});
