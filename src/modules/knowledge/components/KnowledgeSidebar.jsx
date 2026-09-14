import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, ChevronRight, Clock3, FileText, Folder, HardDrive, Hash, Star, X } from 'lucide-react';
import { buildNoteTree, noteFolder, noteTitle, parseTags } from '../lib/notes';

function FolderBranch({ node, selectedNote, onNavigate, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (selectedNote && (noteFolder(selectedNote) === node.path || noteFolder(selectedNote).startsWith(`${node.path}/`))) {
      setExpanded(true);
    }
  }, [selectedNote?.id, node.path]);

  return (
    <div className="knowledge-folder" style={{ '--folder-depth': depth }}>
      <div className="knowledge-folder-row">
        <button className="knowledge-folder-toggle" aria-label={`${expanded ? '收起' : '展开'} ${node.path}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <ChevronRight size={13} className={expanded ? 'is-expanded' : ''} />
        </button>
        <Link className="knowledge-folder-link" to={`/knowledge?folder=${encodeURIComponent(node.path)}`} onClick={onNavigate} title={node.path}>
          <Folder size={15} /><span>{node.name}</span><small>{node.count}</small>
        </Link>
      </div>
      {expanded && <div className="knowledge-folder-children">
        {node.children.map(child => <FolderBranch key={child.path} node={child} selectedNote={selectedNote} onNavigate={onNavigate} depth={depth + 1} />)}
        {node.notes.map(note => <Link
          key={note.id}
          to={`/knowledge/${encodeURIComponent(note.id)}`}
          className={`knowledge-tree-note${selectedNote?.id === note.id ? ' is-active' : ''}`}
          aria-current={selectedNote?.id === note.id ? 'page' : undefined}
          title={noteTitle(note)}
          onClick={onNavigate}
        >
          <FileText size={14} /><span>{noteTitle(note)}</span>{note.pinned && <Star size={11} className="knowledge-pinned-icon" />}
        </Link>)}
      </div>}
    </div>
  );
}

export default function KnowledgeSidebar({ notes, selectedNote, view, isOpen, onClose, oldCardCount, onOldBoard }) {
  const tree = useMemo(() => buildNoteTree(notes), [notes]);
  const tags = useMemo(() => {
    const counts = new Map();
    notes.forEach(note => parseTags(note.tags).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'));
  }, [notes]);

  return <>
    {isOpen && <button className="knowledge-sidebar-backdrop" aria-label="关闭知识目录" onClick={onClose} />}
    <aside className={`knowledge-sidebar${isOpen ? ' is-open' : ''}`} aria-label="知识目录">
      <div className="knowledge-sidebar-mobile-title"><strong>知识目录</strong><button className="knowledge-icon-button" aria-label="关闭目录" onClick={onClose}><X size={18} /></button></div>
      <nav className="knowledge-shortcuts" aria-label="知识库视图">
        <Link to="/knowledge" onClick={onClose} className={!selectedNote && !view ? 'is-active' : ''}><BookOpen size={17} /><span>知识概览</span><small>{notes.length}</small></Link>
        <Link to="/knowledge?view=recent" onClick={onClose} className={view === 'recent' ? 'is-active' : ''}><Clock3 size={17} /><span>最近更新</span></Link>
        <Link to="/knowledge?view=pinned" onClick={onClose} className={view === 'pinned' ? 'is-active' : ''}><Star size={17} /><span>置顶笔记</span><small>{notes.filter(note => note.pinned).length || ''}</small></Link>
      </nav>
      <div className="knowledge-sidebar-scroll">
        <div className="knowledge-section-label"><span>我的目录</span><span>{tree.length ? String(tree.length).padStart(2, '0') : ''}</span></div>
        {tree.length ? <nav aria-label="笔记目录树">{tree.map(node => <FolderBranch key={node.path} node={node} selectedNote={selectedNote} onNavigate={onClose} />)}</nav>
          : <p className="knowledge-directory-empty">从第一篇笔记开始。<br />填写目录，即可自动归类。</p>}
        {!!tags.length && <section className="knowledge-sidebar-tags" aria-label="笔记标签">
          <div className="knowledge-section-label"><span>标签</span><Hash size={13} /></div>
          <div className="knowledge-tag-cloud">{tags.map(([tag, count]) => <Link key={tag} to={`/knowledge?tag=${encodeURIComponent(tag)}`} onClick={onClose}>#{tag}<small>{count}</small></Link>)}</div>
        </section>}
      </div>
      <div className="knowledge-sidebar-bottom">
        {oldCardCount > 0 && <button className="knowledge-old-board" onClick={onOldBoard}><span>原有知识卡片 · {oldCardCount}</span><ArrowUpRight size={14} /></button>}
        <div><HardDrive size={13} /><span>本地知识库</span><span className="knowledge-local-dot" /></div>
      </div>
    </aside>
  </>;
}
