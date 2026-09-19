import React, { useState } from 'react';
import { ChevronDown, GripVertical, Plus, X } from 'lucide-react';
import KanbanCard from './KanbanCard';
import ImageThumbnail from './ImageThumbnail';
import ColumnResizer from './ColumnResizer';
import { MAX_CARD_IMAGES, imagesFromClipboardEvent } from '../lib/clipboardImage';
import { taskRecordId } from '../../sync/workspace';

export default function KanbanColumn({
  column,
  cards,
  width,
  collapsed,
  onToggleCollapsed,
  onAdd,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  scheduledByTask,
  onSchedule,
  onResize,
  onResizeCommit,
  onDropOnColumn,
  onDropOnCard,
  isDropTarget,
  moveTargets,
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [images, setImages] = useState([]);
  const [pasteError, setPasteError] = useState('');

  const resetComposer = () => {
    setTitle('');
    setImages([]);
    setPasteError('');
    setAdding(false);
  };

  const submit = event => {
    event.preventDefault();
    if (!title.trim() && !images.length) return;
    onAdd({ title: title.trim(), images });
    resetComposer();
  };

  const attachImages = async event => {
    setPasteError('');
    try {
      const next = await imagesFromClipboardEvent(event, MAX_CARD_IMAGES - images.length);
      if (!next.length) return;
      setImages(current => [...current, ...next].slice(0, MAX_CARD_IMAGES));
    } catch (error) {
      setPasteError(error.message || '图片读取失败，请重新复制图片后再试');
    }
  };

  return (
    <section
      data-column-id={column.id}
      className={`kanban-column${collapsed ? ' collapsed' : ''}${isDropTarget ? ' drop-target' : ''}`}
      style={{ width: `${width}px` }}
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

      <ColumnResizer width={width} onResize={onResize} onCommit={onResizeCommit} />

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
                onDragEnd={onDragEnd}
                scheduledBlocks={scheduledByTask.get(taskRecordId(card)) || []}
                onSchedule={onSchedule}
                onDropOnCard={onDropOnCard}
                moveTargets={moveTargets}
              />
            ))}
          </div>

          {adding ? (
            <form className="kanban-add-form" onSubmit={submit}>
              <textarea
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="输入卡片标题，可粘贴图片"
                rows={2}
                autoFocus
                onPaste={attachImages}
                onKeyDown={event => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    submit(event);
                    return;
                  }
                  if (event.key === 'Escape') resetComposer();
                }}
              />
              {images.length > 0 && (
                <div className="kanban-image-row">
                  {images.map((src, index) => (
                    <div className="kanban-image-thumb" key={src.slice(-24) + index}>
                      <ImageThumbnail src={src} index={index} />
                      <button
                        type="button"
                        className="kanban-image-remove"
                        aria-label="移除图片"
                        onClick={() => setImages(current => current.filter((_, item) => item !== index))}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {pasteError && <p className="kanban-paste-error" role="alert">{pasteError}</p>}
              <div className="kanban-add-actions">
                <button type="submit" className="kanban-add-confirm">添加卡片</button>
                <span className="kanban-shortcut">Ctrl+Enter</span>
                <button type="button" className="kanban-icon-button" aria-label="取消" onClick={resetComposer}>
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
