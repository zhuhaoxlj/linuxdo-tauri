import React, { useState } from 'react';
import { ChevronDown, GripVertical, Plus, X } from 'lucide-react';
import KanbanCard from './KanbanCard';

export default function KanbanColumn({
  column,
  cards,
  collapsed,
  onToggleCollapsed,
  onAdd,
  onUpdate,
  onDelete,
  onDragStart,
  onDropOnColumn,
  onDropOnCard,
  isDropTarget,
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const submit = event => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim());
    setTitle('');
    setAdding(false);
  };

  return (
    <section
      className={`kanban-column${collapsed ? ' collapsed' : ''}${isDropTarget ? ' drop-target' : ''}`}
      onDragOver={event => { event.preventDefault(); onDropOnColumn.hover(column.id); }}
      onDragLeave={() => onDropOnColumn.leave(column.id)}
      onDrop={event => onDropOnColumn.drop(event, column.id)}
    >
      <header className="kanban-column-header">
        <span className="kanban-column-grip" aria-hidden="true"><GripVertical size={16} /></span>
        <button
          type="button"
          className="kanban-icon-button"
          aria-label={collapsed ? `展开 ${column.name}` : `折叠 ${column.name}`}
          onClick={onToggleCollapsed}
        >
          <ChevronDown size={16} className={collapsed ? 'chevron-collapsed' : ''} />
        </button>
        <h2>{column.name}</h2>
        <b>{cards.length}</b>
      </header>

      {!collapsed && (
        <>
          <div className="kanban-cards">
            {cards.map(card => (
              <KanbanCard
                key={card.id}
                task={card}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onDragStart={onDragStart}
                onDropOnCard={onDropOnCard}
              />
            ))}
          </div>

          {adding ? (
            <form className="kanban-add-form" onSubmit={submit}>
              <textarea
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="输入卡片标题"
                rows={2}
                autoFocus
                onKeyDown={event => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    submit(event);
                    return;
                  }
                  if (event.key === 'Escape') {
                    setAdding(false);
                    setTitle('');
                  }
                }}
              />
              <div className="kanban-add-actions">
                <button type="submit" className="kanban-add-confirm">添加卡片</button>
                <span className="kanban-shortcut">Ctrl+Enter</span>
                <button type="button" className="kanban-icon-button" aria-label="取消" onClick={() => { setAdding(false); setTitle(''); }}>
                  <X size={16} />
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="kanban-add-button" onClick={() => setAdding(true)}>
              <Plus size={16} />添加卡片
            </button>
          )}
        </>
      )}
    </section>
  );
}
