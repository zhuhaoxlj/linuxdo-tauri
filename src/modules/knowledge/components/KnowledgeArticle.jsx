import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, Clock3, FilePenLine, Folder, Link as LinkIcon, List, Tags, Text, CalendarDays } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import { renderNoteMarkdown } from '../lib/markdown';
import { NOTE_TYPES, formatNoteDate, noteFolder, noteTitle, parseTags, readingStats, safeSourceUrl, sortNotes } from '../lib/notes';

export default function KnowledgeArticle({ note, notes, onEdit }) {
  const scroll = useRef(null);
  const [activeHeading, setActiveHeading] = useState('');
  const document = useMemo(() => renderNoteMarkdown(note.content), [note.content]);
  const stats = readingStats(note.content);
  const type = NOTE_TYPES.find(item => item.id === note.type) || NOTE_TYPES[0];
  const folder = noteFolder(note);
  const source = safeSourceUrl(note.sourceUrl);
  const siblings = sortNotes(notes.filter(item => noteFolder(item) === folder));
  const currentIndex = siblings.findIndex(item => item.id === note.id);
  const previous = siblings[currentIndex - 1];
  const next = siblings[currentIndex + 1];

  useEffect(() => { scroll.current.scrollTop = 0; }, [note.id]);
  useEffect(() => {
    const container = scroll.current;
    let frame;
    const update = () => {
      const top = container.getBoundingClientRect().top + 100;
      let selected = document.headings[0]?.id || '';
      for (const heading of document.headings) {
        const node = container.querySelector(`[id="${CSS.escape(heading.id)}"]`);
        if (node && node.getBoundingClientRect().top <= top) selected = heading.id;
      }
      setActiveHeading(selected);
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => { container.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [document]);

  const jumpTo = id => {
    scroll.current.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveHeading(id);
  };

  return <div ref={scroll} className="knowledge-article-scroll">
    <div className="knowledge-article-layout">
      <article className="knowledge-article">
        <nav className="knowledge-breadcrumb" aria-label="当前位置"><Link to="/knowledge">知识库</Link><ChevronRight size={12} /><Link to={`/knowledge?folder=${encodeURIComponent(folder)}`}><Folder size={13} />{folder}</Link></nav>
        <div className="knowledge-article-eyebrow"><span>{type.icon} {type.label}</span><span className={`knowledge-status ${note.status === 'ready' ? 'is-ready' : ''}`}>{note.status === 'ready' ? '已整理' : '待整理'}</span></div>
        <h1 className="knowledge-article-title">{noteTitle(note)}</h1>
        <div className="knowledge-article-meta">
          <div><CalendarDays size={14} /><span>更新于 {formatNoteDate(note.updatedAt || note.createdAt)}</span></div>
          <div><Text size={14} /><span>{stats.words.toLocaleString('zh-CN')} 字</span></div>
          <div><Clock3 size={14} /><span>{stats.minutes} 分钟阅读</span></div>
        </div>
        {!!parseTags(note.tags).length && <div className="knowledge-article-tags"><Tags size={14} />{parseTags(note.tags).map(tag => <Link className="knowledge-tag" key={tag} to={`/knowledge?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>)}</div>}
        {note.summary?.trim() && <div className="knowledge-article-summary"><span>内容提要</span><p>{note.summary}</p></div>}
        {document.headings.length > 0 && <details className="knowledge-mobile-outline"><summary><List size={16} />本页大纲</summary>{document.headings.map(heading => <button key={heading.id} onClick={() => jumpTo(heading.id)}>{heading.text}</button>)}</details>}
        {document.html ? <MarkdownContent document={document} /> : <div className="knowledge-blank-article"><FilePenLine size={28} /><h2>想法值得被记录</h2><p>这篇笔记还没有正文，写下你的第一段思考吧。</p><button className="knowledge-button" onClick={onEdit}>开始写作<ArrowRight size={15} /></button></div>}
        {source && <section className="knowledge-reference"><h2><LinkIcon size={17} />参考来源</h2><a href={source} target="_blank" rel="noopener noreferrer">{source}<ArrowRight size={14} /></a></section>}
        <footer className="knowledge-article-footer"><span>创建于 {formatNoteDate(note.createdAt)}</span><button onClick={onEdit}><FilePenLine size={14} />继续完善这篇笔记</button></footer>
        {(previous || next) && <nav className="knowledge-neighbors" aria-label="同目录笔记">
          {previous ? <Link to={`/knowledge/${encodeURIComponent(previous.id)}`}><small><ArrowLeft size={12} />上一篇</small><span>{noteTitle(previous)}</span></Link> : <span />}
          {next && <Link to={`/knowledge/${encodeURIComponent(next.id)}`}><small>下一篇<ArrowRight size={12} /></small><span>{noteTitle(next)}</span></Link>}
        </nav>}
      </article>
      <aside className="knowledge-outline" aria-label="本页大纲">
        <h2><List size={15} />本页大纲</h2>
        {document.headings.length ? <nav>{document.headings.map(heading => <button key={heading.id} className={activeHeading === heading.id ? 'is-active' : ''} aria-current={activeHeading === heading.id ? 'location' : undefined} style={{ paddingLeft: `${12 + Math.min(heading.level - 1, 3) * 10}px` }} onClick={() => jumpTo(heading.id)}>{heading.text}</button>)}</nav>
          : <p>正文中的标题<br />会自动出现在这里。</p>}
        <div className="knowledge-outline-bottom"><span>一点记录，一点积累。</span><button onClick={() => scroll.current.scrollTo({ top: 0, behavior: 'smooth' })}>回到顶部 ↑</button></div>
      </aside>
    </div>
  </div>;
}
