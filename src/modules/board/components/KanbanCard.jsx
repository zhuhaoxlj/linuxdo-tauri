import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

export default function KanbanCard({ task, onUpdate, onDelete, onDragStart, onDropOnCard }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

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
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = event => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKey = event => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const save = () => {
    const next = title.trim();
    if (next && next !== task.title) onUpdate(task.id, { title: next });
    else setTitle(task.title);
    setEditing(false);
  };

  return (
    <article
      className="kanban-card"
      draggable={!editing && !menuOpen}
      onDragStart={event => onDragStart(event, task.id)}
      onDragOver={event => event.preventDefault()}
      onDrop={event => onDropOnCard(event, task.id)}
    >
      {editing ? (
        <textarea
          className="kanban-card-editor"
          value={title}
          onChange={event => setTitle(event.target.value)}
          onBlur={save}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              save();
            }
            if (event.key === 'Escape') {
              setTitle(task.title);
              setEditing(false);
            }
          }}
          rows={2}
          autoFocus
        />
      ) : (
        <p className="kanban-card-title">{task.title}</p>
      )}

      <div className="kanban-card-menu">
        <button
          ref={buttonRef}
          type="button"
          className="kanban-icon-button"
          aria-label="卡片操作"
          aria-expanded={menuOpen}
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
            <button type="button" onClick={() => { setMenuOpen(false); setEditing(true); }}>
              <Pencil size={14} />编辑
            </button>
            <button type="button" className="danger" onClick={() => onDelete(task.id)}>
              <Trash2 size={14} />删除
            </button>
          </div>,
          document.body,
        )}
      </div>
    </article>
  );
}
