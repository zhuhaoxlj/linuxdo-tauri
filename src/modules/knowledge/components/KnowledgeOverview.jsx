import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronRight, FileText, Folder, Search, Sprout, Star } from 'lucide-react';
import { NOTE_TYPES, formatNoteDate, noteExcerpt, noteFolder, noteTitle, parseTags } from '../lib/notes';

export default function KnowledgeOverview({ notes, filteredNotes, query, folder, tag, view, onCreate, canCreate }) {
  const isHome = !query && !folder && !tag && !view;
  const folders = new Set(notes.map(noteFolder));
  const tags = new Set(notes.flatMap(note => parseTags(note.tags)));
  const displayed = isHome ? filteredNotes.slice(0, 8) : filteredNotes;
  const title = query ? '搜索结果' : folder || (tag ? `# ${tag}` : view === 'pinned' ? '置顶笔记' : view === 'recent' ? '最近更新' : '全部笔记');

  return <div className="knowledge-overview-scroll">
    <div className="knowledge-overview">
      {isHome ? <>
        <div className="knowledge-home-eyebrow"><span className="knowledge-local-dot" />MY KNOWLEDGE GARDEN</div>
        <h1>记录当下，连接所知<span>。</span></h1>
        <p className="knowledge-home-description">把读过的、想过的，慢慢变成自己的。</p>
        <div className="knowledge-home-stats"><span><strong>{notes.length}</strong>篇记录</span><span><strong>{folders.size}</strong>个目录</span><span><strong>{tags.size}</strong>个标签</span></div>
        <div className="knowledge-capture-options">{NOTE_TYPES.map((type, index) => <button key={type.id} disabled={!canCreate} onClick={() => onCreate(type.id)}>
          <span className="knowledge-capture-icon">{type.icon}</span><div><strong>{['记录笔记', '复盘总结', '整理文章'][index]}</strong><p>{type.description}</p></div><ArrowRight size={16} />
        </button>)}</div>
      </> : <>
        <nav className="knowledge-breadcrumb" aria-label="当前位置"><Link to="/knowledge">知识库</Link><ChevronRight size={12} /><span>{query ? '搜索' : tag ? '标签' : folder ? '目录' : title}</span></nav>
        <div className="knowledge-list-heading"><div><h1>{title}</h1><p>{query ? `“${query}” · 找到 ${filteredNotes.length} 篇记录` : `${filteredNotes.length} 篇记录${folder ? ' · 包含子目录' : ''}`}</p></div>{folder && <button className="knowledge-button" disabled={!canCreate} onClick={() => onCreate('note')}>在此目录写笔记<ArrowRight size={14} /></button>}</div>
      </>}
      <section className="knowledge-note-list" aria-label={isHome ? '最近的笔记' : title}>
        {isHome && <div className="knowledge-list-section-heading"><h2><BookOpen size={18} />慢慢积累的知识</h2><Link to="/knowledge?view=all">全部笔记<ArrowRight size={14} /></Link></div>}
        {displayed.length ? <ul>{displayed.map(note => {
          const type = NOTE_TYPES.find(item => item.id === note.type) || NOTE_TYPES[0];
          return <li key={note.id}><Link className="knowledge-note-row" to={`/knowledge/${encodeURIComponent(note.id)}`}>
            <span className="knowledge-note-row-icon">{type.icon}</span>
            <div className="knowledge-note-row-content"><h3>{noteTitle(note)}{note.pinned && <Star size={13} className="knowledge-pinned-icon" />}</h3><p>{noteExcerpt(note) || '还没有正文，等待下一次灵感。'}</p>
              <div className="knowledge-note-row-meta"><span><Folder size={12} />{noteFolder(note)}</span>{parseTags(note.tags).slice(0, 3).map(item => <span key={item}>#{item}</span>)}<span>{note.status === 'ready' ? '已整理' : '待整理'}</span></div>
            </div><div className="knowledge-note-row-end"><time>{formatNoteDate(note.updatedAt || note.createdAt)}</time><ChevronRight size={16} /></div>
          </Link></li>;
        })}</ul> : <div className="knowledge-empty-state">
          <div className="knowledge-empty-illustration">{query ? <Search size={31} /> : view === 'pinned' ? <Star size={31} /> : <Sprout size={36} />}<span>✦</span></div>
          <h2>{query ? '暂时没有找到相关笔记' : view === 'pinned' ? '把常读的笔记放在手边' : '第一篇笔记，写给未来的自己'}</h2>
          <p>{query ? '试试其他关键词，也可以搜索正文、目录和标签。' : view === 'pinned' ? '打开一篇笔记，点击顶部的星标，即可在这里找到它。' : tag || folder ? '这个分类下还没有记录，开始写下你的第一个想法吧。' : '一个新发现、一段阅读感悟，或一次实践总结。\n不必完整，先开始记录。'}</p>
          {!query && view !== 'pinned' && <button className="knowledge-button is-primary" disabled={!canCreate} onClick={() => onCreate('note')}><FileText size={15} />写下第一篇笔记<ArrowRight size={15} /></button>}
        </div>}
      </section>
      {isHome && <footer className="knowledge-home-footer"><Sprout size={14} /><span>知识不是一次收集的结果，而是持续整理的过程。</span></footer>}
    </div>
  </div>;
}
