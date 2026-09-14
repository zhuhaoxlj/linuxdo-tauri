import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Bold, Check, Code2, Columns2, Heading2, Italic, Link as LinkIcon, List, ListChecks, Quote } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import { renderNoteMarkdown } from '../lib/markdown';
import { NOTE_TYPES, SUGGESTED_FOLDERS, noteFolder, parseTags, readingStats, safeSourceUrl } from '../lib/notes';

const TOOLS = [
  { label: '插入二级标题', icon: Heading2, before: '## ', after: '', placeholder: '小节标题', block: true },
  { label: '加粗', icon: Bold, before: '**', after: '**', placeholder: '重点内容' },
  { label: '斜体', icon: Italic, before: '*', after: '*', placeholder: '强调内容' },
  { label: '插入引用', icon: Quote, before: '> ', after: '', placeholder: '值得记住的话', block: true },
  { label: '插入列表', icon: List, before: '- ', after: '', placeholder: '列表内容', block: true },
  { label: '插入待办事项', icon: ListChecks, before: '- [ ] ', after: '', placeholder: '下一步行动', block: true },
  { label: '插入链接', icon: LinkIcon, before: '[', after: '](https://example.com)', placeholder: '链接文字' },
  { label: '插入代码块', icon: Code2, before: '```\n', after: '\n```', placeholder: '代码', block: true },
];

export default function KnowledgeEditor({ note, notes, onChange, onDone }) {
  const editor = useRef(null);
  const [preview, setPreview] = useState(false);
  const [tagsText, setTagsText] = useState(parseTags(note.tags).join('，'));
  const deferredContent = useDeferredValue(note.content || '');
  const document = useMemo(() => renderNoteMarkdown(deferredContent), [deferredContent]);
  const folders = useMemo(() => [...new Set([...SUGGESTED_FOLDERS, ...notes.map(noteFolder)])], [notes]);
  const stats = readingStats(note.content);

  const insert = tool => {
    const input = editor.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const content = note.content || '';
    const selection = content.slice(start, end) || tool.placeholder;
    const leading = tool.block && start > 0 && content[start - 1] !== '\n' ? '\n\n' : '';
    const trailing = tool.block && content[end] && content[end] !== '\n' ? '\n\n' : '';
    const addition = `${leading}${tool.before}${selection}${tool.after}${trailing}`;
    onChange({ content: `${content.slice(0, start)}${addition}${content.slice(end)}` });
    requestAnimationFrame(() => {
      input.focus();
      const selectionStart = start + leading.length + tool.before.length;
      input.setSelectionRange(selectionStart, selectionStart + selection.length);
    });
  };

  const keyboard = event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 's') event.preventDefault();
    if (event.key === 'Enter') { event.preventDefault(); onDone(); }
  };

  return <div className="knowledge-editor-scroll" onKeyDown={keyboard}>
    <div className="knowledge-editor">
      <div className="knowledge-editor-heading"><span>给思考留一个位置</span><button className="knowledge-button is-primary" onClick={onDone} title="Ctrl / ⌘ + Enter"><Check size={16} />完成编辑</button></div>
      <label className="sr-only" htmlFor="knowledge-title">笔记标题</label>
      <input id="knowledge-title" className="knowledge-title-input" placeholder="给这篇笔记起个名字…" value={note.title || ''} onChange={event => onChange({ title: event.target.value })} autoFocus={!note.title} />
      <label className="sr-only" htmlFor="knowledge-summary">一句话摘要</label>
      <textarea id="knowledge-summary" className="knowledge-summary-input" rows={2} placeholder="用一句话概括，留给未来的自己（可选）" value={note.summary || ''} onChange={event => onChange({ summary: event.target.value })} />
      <div className="knowledge-editor-properties">
        <label>目录<input list="knowledge-folders" value={note.folder || ''} placeholder="如：学习笔记 / 前端" onChange={event => onChange({ folder: event.target.value })} /></label>
        <datalist id="knowledge-folders">{folders.map(folder => <option key={folder} value={folder} />)}</datalist>
        <label>类型<select value={note.type || 'note'} onChange={event => onChange({ type: event.target.value })}>{NOTE_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
        <label>整理状态<select value={note.status || 'draft'} onChange={event => onChange({ status: event.target.value })}><option value="draft">待整理</option><option value="ready">已整理</option></select></label>
        <label className="knowledge-tags-field">标签<input value={tagsText} placeholder="用逗号分隔，如：阅读，方法论" onChange={event => { setTagsText(event.target.value); onChange({ tags: parseTags(event.target.value) }); }} /></label>
        <label className="knowledge-source-field">参考来源<input type="url" value={note.sourceUrl || ''} placeholder="原文链接 https://…（可选）" onChange={event => onChange({ sourceUrl: event.target.value })} />
          {note.sourceUrl && !safeSourceUrl(note.sourceUrl) && <small className="knowledge-field-error">请填写完整的 http 或 https 链接</small>}
        </label>
      </div>
      <div className="knowledge-writing-surface">
        <div className="knowledge-editor-toolbar">
          <div className="knowledge-format-tools">{TOOLS.map(tool => <button key={tool.label} className="knowledge-icon-button" title={tool.label} aria-label={tool.label} onMouseDown={event => event.preventDefault()} onClick={() => insert(tool)}><tool.icon size={16} /></button>)}</div>
          <button className={`knowledge-preview-toggle${preview ? ' is-active' : ''}`} aria-label="分屏预览" aria-pressed={preview} onClick={() => setPreview(!preview)}><Columns2 size={15} /><span>分屏预览</span></button>
        </div>
        <div className={`knowledge-editor-panes${preview ? ' has-preview' : ''}`}>
          <textarea ref={editor} className="knowledge-markdown-input" aria-label="Markdown 正文" placeholder={'从这里开始写吧…\n\n用 ## 写一个小节，用 > 留下一段摘录。\n记录你的发现，也记录你的问题。'} value={note.content || ''} onChange={event => onChange({ content: event.target.value })} spellCheck={false} />
          {preview && <section className="knowledge-live-preview" aria-label="Markdown 预览"><span className="knowledge-preview-label">阅读预览</span>{document.html ? <MarkdownContent document={document} /> : <p className="knowledge-preview-empty">你的文字，会在这里慢慢成形。</p>}</section>}
        </div>
        <div className="knowledge-editor-footer"><span>{stats.words.toLocaleString('zh-CN')} 字 · 约 {stats.minutes} 分钟阅读</span><span>Markdown · 自动保存</span></div>
      </div>
      <details className="knowledge-writing-help"><summary>Markdown 小提示</summary><p><code>## 标题</code> 自动生成大纲；<code>**重点**</code> 加粗；<code>- [ ] 行动</code> 添加清单；<code>[文字](链接)</code> 引用资料。目录中使用 <code>/</code> 可以建立层级。</p></details>
    </div>
  </div>;
}
