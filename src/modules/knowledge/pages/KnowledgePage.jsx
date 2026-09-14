import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, BookOpen, Check, Copy, FilePenLine, Menu, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { useBoard } from '../../board/context/BoardContext';
import { copyCardContent } from '../../board/lib/clipboardContent';
import KnowledgeSidebar from '../components/KnowledgeSidebar';
import KnowledgeOverview from '../components/KnowledgeOverview';
import KnowledgeArticle from '../components/KnowledgeArticle';
import KnowledgeEditor from '../components/KnowledgeEditor';
import { createNoteDraft, exportNoteMarkdown, filterNotes, noteFolder, noteTitle, parseTags } from '../lib/notes';
import '../knowledge.css';

export default function KnowledgePage() {
  const { notes, tasks, addNote, updateNote, deleteNote, setActiveCategory, loading, storageError, storageReady } = useBoard();
  const { noteId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const searchInput = useRef(null);
  const deleteDialog = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [notification, setNotification] = useState(null);
  const query = params.get('search') || '';
  const folder = params.get('folder') || '';
  const tag = params.get('tag') || '';
  const view = params.get('view') || '';
  const selectedNote = notes.find(note => note.id === noteId);
  const isEditing = Boolean(selectedNote && params.get('edit') === '1');
  const filteredNotes = useMemo(() => filterNotes(notes, { query, folder, tag, view }), [notes, query, folder, tag, view]);

  useEffect(() => {
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    if (!notification) return undefined;
    const timer = setTimeout(() => setNotification(null), 3500);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    if (deleteCandidate) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleteCandidate]);

  const create = type => {
    if (!storageReady) return;
    const note = addNote(createNoteDraft(type, folder || (selectedNote ? noteFolder(selectedNote) : '随手记')));
    setSidebarOpen(false);
    navigate(`/knowledge/${note.id}?edit=1`);
  };

  const finishEditing = () => {
    updateNote(selectedNote.id, { title: noteTitle(selectedNote), folder: noteFolder(selectedNote), tags: parseTags(selectedNote.tags) });
    navigate(`/knowledge/${encodeURIComponent(selectedNote.id)}`);
  };

  const copyMarkdown = async () => {
    try {
      await copyCardContent({ title: exportNoteMarkdown(selectedNote) });
      setNotification({ message: '已复制 Markdown，可粘贴到本地文件或其他笔记工具。' });
    } catch {
      setNotification({ message: '复制失败，请重试或在编辑器中手动复制正文。', error: true });
    }
  };

  const returnToBoard = category => {
    setActiveCategory(category);
    navigate('/board');
  };

  return <div className="knowledge-shell">
    <header className="knowledge-topbar">
      <div className="knowledge-topbar-brand"><button className="knowledge-icon-button knowledge-mobile-menu" aria-label="打开知识目录" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={19} /></button><BookOpen size={23} /><button onClick={() => navigate('/knowledge')}>知识库</button><span>个人知识花园</span></div>
      <div className="knowledge-search"><Search size={16} /><input ref={searchInput} aria-label="搜索知识库" placeholder="搜索标题、正文、标签…" value={query} onChange={event => navigate(event.target.value ? `/knowledge?search=${encodeURIComponent(event.target.value)}` : '/knowledge', { replace: Boolean(query) })} />{query ? <button className="knowledge-icon-button" aria-label="清除搜索" onClick={() => navigate('/knowledge')}><X size={14} /></button> : <kbd>Ctrl K</kbd>}</div>
      <div className="knowledge-topbar-actions"><button className="knowledge-icon-button knowledge-back-button" aria-label="返回看板" title="返回看板" onClick={() => returnToBoard('home')}><ArrowLeft size={17} /></button><button className="knowledge-button is-primary" disabled={loading || !storageReady} onClick={() => create('note')}><Plus size={17} /><span>新建笔记</span></button></div>
    </header>
    {storageError && <div className="knowledge-storage-error" role="alert"><AlertCircle size={17} />{storageError}</div>}
    <div className="knowledge-body">
      <KnowledgeSidebar notes={notes} selectedNote={selectedNote} view={query ? 'search' : folder ? 'folder' : tag ? 'tag' : view} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} oldCardCount={tasks.filter(task => task.category === 'knowledge').length} onOldBoard={() => returnToBoard('knowledge')} />
      <div className="knowledge-main">
        {loading ? <div className="knowledge-loading" role="status">正在整理你的知识库…</div> : noteId ? selectedNote ? <>
          <div className="knowledge-document-toolbar"><div className="knowledge-save-state">{storageError ? <AlertCircle size={13} /> : <Check size={13} />}<span>{storageError ? '尚未保存' : '已保存到本地'}</span>{isEditing && <span className="knowledge-editing-label">正在编辑</span>}</div><div className="knowledge-document-actions">
            {!isEditing && <button className="knowledge-button is-quiet" onClick={() => navigate(`/knowledge/${encodeURIComponent(noteId)}?edit=1`)}><FilePenLine size={15} />编辑</button>}
            <button className={`knowledge-icon-button${selectedNote.pinned ? ' is-pinned' : ''}`} aria-label={selectedNote.pinned ? '取消置顶' : '置顶笔记'} title={selectedNote.pinned ? '取消置顶' : '置顶笔记'} aria-pressed={Boolean(selectedNote.pinned)} onClick={() => updateNote(noteId, { pinned: !selectedNote.pinned })}><Star size={16} /></button>
            <button className="knowledge-icon-button" aria-label="复制 Markdown" title="复制 Markdown（含标题、摘要和来源）" onClick={copyMarkdown}><Copy size={16} /></button>
            <button className="knowledge-icon-button knowledge-delete-button" aria-label="删除笔记" title="删除笔记" onClick={() => setDeleteCandidate(selectedNote)}><Trash2 size={16} /></button>
          </div></div>
          {isEditing ? <KnowledgeEditor key={selectedNote.id} note={selectedNote} notes={notes} onChange={changes => updateNote(noteId, changes)} onDone={finishEditing} /> : <KnowledgeArticle key={selectedNote.id} note={selectedNote} notes={notes} onEdit={() => navigate(`/knowledge/${encodeURIComponent(noteId)}?edit=1`)} />}
        </> : <div className="knowledge-empty-state"><BookOpen size={32} /><h1>这篇笔记不在知识库中</h1><p>它可能已被删除，请从目录中选择另一篇。</p><button className="knowledge-button" onClick={() => navigate('/knowledge')}>返回知识概览</button></div>
          : <KnowledgeOverview notes={notes} filteredNotes={filteredNotes} query={query} folder={folder} tag={tag} view={view} onCreate={create} canCreate={storageReady} />}
      </div>
    </div>
    {notification && <div className={`knowledge-notification${notification.error ? ' is-error' : ''}`} role={notification.error ? 'alert' : 'status'}>{notification.error ? <AlertCircle size={17} /> : <Check size={17} />}{notification.message}</div>}
    <dialog ref={deleteDialog} className="knowledge-delete-dialog" aria-labelledby="knowledge-delete-title" aria-describedby="knowledge-delete-description" onCancel={event => { event.preventDefault(); setDeleteCandidate(null); }}>
      <div className="knowledge-delete-symbol"><Trash2 size={22} /></div><h2 id="knowledge-delete-title">删除这篇笔记？</h2><p id="knowledge-delete-description">「{deleteCandidate ? noteTitle(deleteCandidate) : ''}」将从本地知识库中删除，此操作无法撤销。</p><div><button className="knowledge-button" onClick={() => setDeleteCandidate(null)}>保留笔记</button><button className="knowledge-button is-danger" onClick={() => { deleteNote(deleteCandidate.id); setDeleteCandidate(null); navigate('/knowledge'); }}>确认删除</button></div>
    </dialog>
  </div>;
}
