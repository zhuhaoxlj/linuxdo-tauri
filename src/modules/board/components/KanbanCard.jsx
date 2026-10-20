import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, FolderInput, GripVertical, ListTodo, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2, X } from 'lucide-react';
import { MAX_CARD_IMAGES, imagesFromClipboardEvent } from '../lib/clipboardImage';
import { copyCardContent } from '../lib/clipboardContent';
import { linkSegments, openLinkFromEvent } from '../lib/links';
import { addSubtask, deleteSubtask, editSubtask, normalizeSubtasks, reorderSubtask, shiftSubtask, toggleSubtask } from '../lib/tasks';
import ImageThumbnail from './ImageThumbnail';

const copyMessages = { copying: '正在复制…', copied: '已复制到剪贴板', failed: '复制失败，请重试' };
const SUBTASKS_COLLAPSED_KEY = 'fluxdo:card-subtasks-collapsed';

function initialSubtasksOpen() {
  try { return localStorage.getItem(SUBTASKS_COLLAPSED_KEY) !== '1'; }
  catch { return true; }
}

export default function KanbanCard({ task, onUpdate, onDelete, onPointerDragStart, onDragClickCapture, isDragging, dropPosition, scheduledBlocks = [], onSchedule, moveTargets = [] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('actions');
  const [editing, setEditing] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [title, setTitle] = useState(task.title);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [subtasksOpen, setSubtasksOpen] = useState(initialSubtasksOpen);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const cardRef = useRef(null);
  const editorRef = useRef(null);
  const subtaskInputRef = useRef(null);
  const subtaskListRef = useRef(null);
  const subtaskDragRef = useRef(null);
  const subtaskOrderRef = useRef(null);
  const subtaskSuppressClick = useRef(0);
  const [subtaskDrag, setSubtaskDrag] = useState(null);
  const images = task.images || [];
  const subtasks = useMemo(() => normalizeSubtasks(task.subtasks), [task.subtasks]);
  // 拖动过程中按本地预览顺序渲染，松手后才写回数据。
  const displayedSubtasks = useMemo(() => {
    const order = subtaskDrag?.order;
    if (!order) return subtasks;
    const byId = new Map(subtasks.map(item => [item.id, item]));
    const ordered = order.map(id => byId.get(id)).filter(Boolean);
    if (ordered.length !== subtasks.length) return subtasks;
    return ordered;
  }, [subtasks, subtaskDrag]);
  const draggingSubtaskId = subtaskDrag?.id || null;
  const doneSubtasks = subtasks.filter(item => item.done).length;
  const titleSegments = useMemo(() => linkSegments(task.title), [task.title]);

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

  useEffect(() => {
    if (copyStatus !== 'copied') return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  useLayoutEffect(() => {
    if (!menuOpen || !buttonRef.current) return undefined;
    const place = () => {
      const button = buttonRef.current.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      const width = menu?.width || 132;
      const height = menu?.height || 80;
      const gap = 6;
      const left = Math.min(Math.max(8, button.right - width), window.innerWidth - width - 8);
      const below = button.bottom + gap;
      const top = below + height > window.innerHeight - 8
        ? Math.max(8, button.top - height - gap)
        : below;
      setMenuPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [menuOpen, menuView, moveTargets.length]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuView('actions');
      return undefined;
    }
    const close = event => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKey = event => {
      if (event.key !== 'Escape') return;
      if (menuView === 'move') setMenuView('actions');
      else setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, menuView]);

  // 编辑框随内容长高，换行后的多行卡片在编辑器里也能完整看到（上限 240px 后内部滚动）
  useLayoutEffect(() => {
    const node = editorRef.current;
    if (!editing || !node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 240)}px`;
  }, [editing, title]);

  const save = () => {
    const next = title.trim();
    if (next !== (task.title || '')) onUpdate(task.id, { title: next });
    else setTitle(task.title || '');
    setEditing(false);
  };

  const startEditing = () => {
    setMenuOpen(false);
    setPasteError('');
    setEditing(true);
  };

  const toggleSubtasksOpen = () => {
    setSubtasksOpen(open => {
      try { localStorage.setItem(SUBTASKS_COLLAPSED_KEY, open ? '1' : '0'); }
      catch { /* 存储不可用时仅关闭本次展开状态 */ }
      return !open;
    });
  };

  const openSubtaskInput = () => {
    setEditing(false);
    setSubtasksOpen(true);
    setSubtaskInput('');
    requestAnimationFrame(() => subtaskInputRef.current?.focus());
  };

  // 允许多行粘贴：每行生成一条子任务
  const commitSubtaskInput = value => {
    const lines = String(value ?? '').split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) return;
    let next = normalizeSubtasks(task.subtasks);
    for (const line of lines) next = addSubtask(next, line) || next;
    onUpdate(task.id, { subtasks: next });
  };

  const submitSubtasks = () => {
    commitSubtaskInput(subtaskInput);
    setSubtaskInput('');
    requestAnimationFrame(() => subtaskInputRef.current?.focus());
  };

  const saveSubtaskTitle = id => {
    const next = editSubtask(task.subtasks, id, { title: subtaskDraft });
    setEditingSubtaskId(null);
    setSubtaskDraft('');
    onUpdate(task.id, { subtasks: next });
  };

  // 子任务拖动排序：指针移动超过阈值才进入拖动态，避免影响点击编辑。
  const startSubtaskDrag = (event, id) => {
    if (event.button !== 0 || event.isPrimary === false || editingSubtaskId === id) return;
    const origin = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    let active = false;
    let ended = false;

    const orderAt = clientY => {
      const listNode = subtaskListRef.current;
      if (!listNode) return null;
      const nodes = Array.from(listNode.querySelectorAll('[data-subtask-id]'))
        .filter(node => node.dataset.subtaskId !== id);
      let index = nodes.length;
      for (let item = 0; item < nodes.length; item += 1) {
        const rect = nodes[item].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) { index = item; break; }
      }
      const order = nodes.map(node => node.dataset.subtaskId);
      order.splice(index, 0, id);
      return order;
    };

    const preview = clientY => {
      const listNode = subtaskListRef.current;
      if (listNode && listNode.scrollHeight > listNode.clientHeight) {
        const rect = listNode.getBoundingClientRect();
        if (clientY < rect.top + 18) listNode.scrollTop -= 8;
        else if (clientY > rect.bottom - 18) listNode.scrollTop += 8;
      }
      const next = orderAt(clientY);
      if (!next) return;
      const current = subtaskOrderRef.current;
      if (current && current.join('\u0000') === next.join('\u0000')) return;
      subtaskOrderRef.current = next;
      setSubtaskDrag({ id, order: next });
    };

    const finish = (canceled = false) => {
      if (ended) return;
      ended = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      document.body.classList.remove('subtask-pointer-dragging');
      subtaskDragRef.current = null;
      const finalOrder = canceled ? null : subtaskOrderRef.current;
      subtaskOrderRef.current = null;
      setSubtaskDrag(null);
      if (!active) return;
      subtaskSuppressClick.current = Date.now() + 300;
      if (!finalOrder) return;
      const original = normalizeSubtasks(task.subtasks);
      if (finalOrder.join('\u0000') === original.map(item => item.id).join('\u0000')) return;
      const byId = new Map(original.map(item => [item.id, item]));
      const next = finalOrder.map(itemId => byId.get(itemId)).filter(Boolean);
      if (next.length === original.length) onUpdate(task.id, { subtasks: next });
    };

    const move = current => {
      if (current.pointerId !== pointerId) return;
      if (!active && Math.hypot(current.clientX - origin.x, current.clientY - origin.y) < 5) return;
      current.preventDefault();
      if (!active) {
        active = true;
        document.body.classList.add('subtask-pointer-dragging');
        window.getSelection()?.removeAllRanges();
      }
      preview(current.clientY);
    };
    const up = current => {
      if (current.pointerId !== pointerId) return;
      finish();
    };
    const cancel = () => finish(true);
    const key = current => {
      if (current.key === 'Escape' && active) { current.preventDefault(); finish(true); }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    subtaskDragRef.current = () => finish(true);
  };

  useEffect(() => () => subtaskDragRef.current?.(), []);

  const nudgeSubtask = (id, offset) => {
    const next = shiftSubtask(task.subtasks, id, offset);
    onUpdate(task.id, { subtasks: next });
  };

  const copyContent = async () => {
    if (copyStatus === 'copying') return;
    const currentTitle = editing ? title.trim() : task.title;
    if (editing) save();
    setMenuOpen(false);
    setCopyStatus('copying');
    const checklist = subtasks.map(item => `${item.done ? '[x]' : '[ ]'} ${item.title}`).join('\n');
    const text = checklist ? `${currentTitle}\n${checklist}` : currentTitle;
    try {
      await copyCardContent({ title: text, images });
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const openTitleLink = (event, url) => {
    // 始终阻止默认行为，避免 WebView 在应用内导航到外部地址。
    event.preventDefault();
    event.stopPropagation();
    openLinkFromEvent(event, url).catch(console.error);
  };

  const attachImages = async event => {
    setPasteError('');
    try {
      const next = await imagesFromClipboardEvent(event, MAX_CARD_IMAGES - images.length);
      if (!next.length) return;
      onUpdate(task.id, { images: [...images, ...next].slice(0, MAX_CARD_IMAGES) });
    } catch (error) {
      setPasteError(error.message || '图片读取失败，请重新复制图片后再试');
    }
  };

  return (
    <article
      ref={cardRef}
      className={`kanban-card${task.pinned ? ' is-pinned' : ''}${isDragging ? ' is-dragging' : ''}${dropPosition ? ` drop-${dropPosition}` : ''}`}
      data-task-id={task.id}
      draggable={false}
      onPointerDown={event => {
        if (!editing && !menuOpen) onPointerDragStart(event, task);
      }}
      onClickCapture={onDragClickCapture}
      onDoubleClickCapture={onDragClickCapture}
      onDoubleClick={event => {
        if (event.target.closest('button, textarea, input, a, dialog, [role="menu"], .kanban-subtask')) return;
        startEditing();
      }}
    >
      {task.pinned && <span className="kanban-pin-badge"><Pin size={12} />已置顶</span>}
      {scheduledBlocks.length > 0 && <span className="kanban-schedule-badge"><Clock3 size={12} />{new Date(scheduledBlocks[0].plannedStart).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}{scheduledBlocks.length > 1 ? ` · 共 ${scheduledBlocks.length} 次` : ''}</span>}
      {editing ? (
        <>
          <textarea
            ref={editorRef}
            className="kanban-card-editor"
            value={title}
            onChange={event => setTitle(event.target.value)}
            onBlur={event => {
              if (cardRef.current?.contains(event.relatedTarget)) return;
              save();
            }}
            onPaste={attachImages}
            onKeyDown={event => {
              // 回车换行，Ctrl / ⌘ + Enter 保存（与“添加卡片”一致）
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                save();
                return;
              }
              if (event.key === 'Escape') {
                setTitle(task.title || '');
                setEditing(false);
              }
            }}
            rows={2}
            autoFocus
          />
          <span className="kanban-shortcut">Enter 换行 · Ctrl+Enter 保存</span>
        </>
      ) : (
        task.title ? (
          <p className="kanban-card-title">
            {titleSegments.map((segment, index) => (
              segment.type === 'link' ? (
                <a
                  key={index}
                  className="kanban-card-link"
                  href={segment.value}
                  title="Ctrl+点击在浏览器中打开"
                  draggable={false}
                  onAuxClick={event => event.preventDefault()}
                  onClick={event => openTitleLink(event, segment.value)}
                >
                  {segment.value}
                </a>
              ) : <React.Fragment key={index}>{segment.value}</React.Fragment>
            ))}
          </p>
        ) : null
      )}

      {images.length > 0 && (
        <div className="kanban-image-row">
          {images.map((src, index) => (
            <div className="kanban-image-thumb" key={src.slice(-24) + index}>
              <ImageThumbnail src={src} index={index} />
              {editing && (
                <button
                  type="button"
                  className="kanban-image-remove"
                  aria-label="移除图片"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => onUpdate(task.id, { images: images.filter((_, item) => item !== index) })}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {subtasks.length > 0 && (
        <div className={`kanban-subtasks${subtasksOpen ? '' : ' is-collapsed'}`}>
          <button
            type="button"
            className="kanban-subtasks-toggle"
            aria-expanded={subtasksOpen}
            title={subtasksOpen ? '折叠子任务' : '展开子任务'}
            onPointerDown={event => event.stopPropagation()}
            onClick={toggleSubtasksOpen}
          >
            <ChevronDown size={13} />
            <ListTodo size={13} />
            <span>子任务</span>
            <b>{doneSubtasks}/{subtasks.length}</b>
          </button>
          {subtasksOpen && (
            <ul
              className="kanban-subtask-list"
              ref={subtaskListRef}
              onClickCapture={event => {
                // 拖动结束后紧跟的 click 不应误触勾选 / 编辑 / 删除
                if (Date.now() >= subtaskSuppressClick.current) return;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {displayedSubtasks.map(item => (
                <li
                  key={item.id}
                  data-subtask-id={item.id}
                  className={`kanban-subtask${item.done ? ' is-done' : ''}${draggingSubtaskId === item.id ? ' is-dragging' : ''}`}
                >
                  <span
                    className="kanban-subtask-grip"
                    aria-hidden="true"
                    title="拖动排序（标题上 Alt+↑/↓ 微调）"
                    onPointerDown={event => { event.stopPropagation(); startSubtaskDrag(event, item.id); }}
                  >
                    <GripVertical size={11} />
                  </span>
                  <button
                    type="button"
                    className="kanban-subtask-check"
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={item.done ? '标记为未完成' : '标记为已完成'}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => onUpdate(task.id, { subtasks: toggleSubtask(task.subtasks, item.id) })}
                  >
                    {item.done ? <Check size={11} /> : null}
                  </button>
                  {editingSubtaskId === item.id ? (
                    <input
                      className="kanban-subtask-editor"
                      value={subtaskDraft}
                      autoFocus
                      aria-label="子任务标题"
                      onChange={event => setSubtaskDraft(event.target.value)}
                      onPointerDown={event => event.stopPropagation()}
                      onBlur={() => saveSubtaskTitle(item.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') { event.preventDefault(); saveSubtaskTitle(item.id); }
                        if (event.key === 'Escape') { setEditingSubtaskId(null); setSubtaskDraft(''); }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="kanban-subtask-title"
                      title="点击编辑子任务（Alt+↑/↓ 调整顺序）"
                      onPointerDown={event => event.stopPropagation()}
                      onClick={() => { setEditingSubtaskId(item.id); setSubtaskDraft(item.title); }}
                      onKeyDown={event => {
                        if (!event.altKey) return;
                        if (event.key === 'ArrowUp') { event.preventDefault(); nudgeSubtask(item.id, -1); }
                        if (event.key === 'ArrowDown') { event.preventDefault(); nudgeSubtask(item.id, 1); }
                      }}
                    >
                      {item.title}
                    </button>
                  )}
                  <button
                    type="button"
                    className="kanban-subtask-remove"
                    aria-label="删除子任务"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => onUpdate(task.id, { subtasks: deleteSubtask(task.subtasks, item.id) })}
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="kanban-subtask-add">
        <Plus size={12} />
        <input
          ref={subtaskInputRef}
          value={subtaskInput}
          aria-label="新增子任务"
          placeholder="添加子任务，回车保存"
          onPointerDown={event => event.stopPropagation()}
          onChange={event => setSubtaskInput(event.target.value)}
          onPaste={event => {
            // 多行粘贴一次建多条子任务
            const text = event.clipboardData?.getData('text/plain') || '';
            if (!text.includes('\n')) return;
            event.preventDefault();
            commitSubtaskInput(text);
            setSubtaskInput('');
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); submitSubtasks(); }
            if (event.key === 'Escape') { setSubtaskInput(''); event.currentTarget.blur(); }
          }}
        />
      </div>

      {pasteError && <p className="kanban-paste-error" role="alert">{pasteError}</p>}
      {copyStatus && (
        <p className={`kanban-copy-status${copyStatus === 'failed' ? ' is-error' : ''}`} role={copyStatus === 'failed' ? 'alert' : 'status'}>
          {copyMessages[copyStatus]}
        </p>
      )}

      <div className="kanban-card-menu">
        <button
          ref={buttonRef}
          type="button"
          className="kanban-icon-button"
          aria-label="卡片操作"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => setMenuOpen(open => !open)}
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && createPortal(
          <div
            ref={menuRef}
            className="kanban-menu"
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {menuView === 'move' ? (
              <>
                <button type="button" role="menuitem" onClick={() => setMenuView('actions')}>
                  <ChevronLeft size={14} />返回
                </button>
                {moveTargets.map(board => (
                  <button
                    key={board.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onUpdate(task.id, { category: board.id });
                      setMenuOpen(false);
                    }}
                  >
                    <span className="kanban-menu-board-icon" aria-hidden="true">{board.icon}</span>
                    {board.name}
                  </button>
                ))}
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={startEditing}>
                  <Pencil size={14} />编辑
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openSubtaskInput(); }}>
                  <Plus size={14} />添加子任务
                </button>
                {task.column !== 'done' && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onSchedule(task.id); }}><CalendarPlus size={14} />安排时间</button>}
                <button type="button" role="menuitem" onClick={() => {
                  if (editing) save();
                  setMenuOpen(false);
                  onUpdate(task.id, { pinned: !task.pinned });
                }}>
                  {task.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  {task.pinned ? '取消置顶' : '置顶'}
                </button>
                {moveTargets.length > 0 && (
                  <button type="button" role="menuitem" onClick={() => setMenuView('move')}>
                    <FolderInput size={14} />移动到
                    <ChevronRight size={14} className="kanban-menu-more" />
                  </button>
                )}
                <button type="button" role="menuitem" aria-label="复制卡片内容到剪贴板" disabled={copyStatus === 'copying'} onClick={copyContent}>
                  <Copy size={14} />复制
                </button>
                <button type="button" role="menuitem" className="danger" onClick={() => onDelete(task.id)}>
                  <Trash2 size={14} />删除
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      </div>
    </article>
  );
}
