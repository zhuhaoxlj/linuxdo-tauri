import assert from 'node:assert/strict';
import test from 'node:test';
import { headingSlug, parseNoteMarkdown } from '../src/modules/knowledge/lib/markdown.js';

test('Markdown headings generate stable, unique anchors and a semantic outline', () => {
  const rendered = parseNoteMarkdown('## 学习 **Markdown**\n\n### 使用 `React`\n\n## 学习 **Markdown**\n\n## 学习 Markdown 1');
  assert.deepEqual(rendered.headings.map(heading => heading.text), ['学习 Markdown', '使用 React', '学习 Markdown', '学习 Markdown 1']);
  assert.deepEqual(rendered.headings.map(heading => heading.level), [2, 3, 2, 2]);
  assert.equal(new Set(rendered.headings.map(heading => heading.id)).size, 4);
  assert.match(rendered.html, /id="kb-学习-markdown"/);
  assert.equal(headingSlug(' 你好，世界！ '), '你好-世界');
  assert.equal(headingSlug('!!!'), 'section');
});

test('code fence content does not leak into the page outline', () => {
  const rendered = parseNoteMarkdown('## 正文\n\n```md\n## 不是大纲\n```\n\n### 下一节');
  assert.equal(rendered.headings.length, 2);
  assert.match(rendered.html, /<pre><code class="language-md">## 不是大纲/);
});

test('the Markdown renderer supports GFM tables, checklists, and rich inline text', () => {
  const rendered = parseNoteMarkdown('## 清单\n\n- [x] 已记录\n- [ ] 待整理\n\n| 概念 | 解释 |\n| --- | --- |\n| 知识 | 积累 |\n\n> **重点**与[资料](https://example.com)');
  assert.match(rendered.html, /<table>/);
  assert.match(rendered.html, /type="checkbox"/);
  assert.match(rendered.html, /<blockquote>/);
  assert.match(rendered.html, /<strong>重点<\/strong>/);
  assert.match(rendered.html, /href="https:\/\/example.com"/);
});

test('raw HTML is not executed or treated as note controls', () => {
  const rendered = parseNoteMarkdown('<script>alert(1)</script>\n\n<form><input name="password"></form>\n\n## 正常内容\n\n`<img onerror="alert(1)">`');
  assert.ok(!rendered.html.includes('<script>'));
  assert.ok(!rendered.html.includes('<form>'));
  assert.match(rendered.html, /&lt;img/);
  assert.equal(rendered.headings[0].text, '正常内容');
  assert.equal(parseNoteMarkdown('').html, '');
});
