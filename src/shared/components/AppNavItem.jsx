import React, { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { CATEGORY_NAME_MAX } from '../../modules/board/lib/categories';
import EmojiPicker from './EmojiPicker';

export default function AppNavItem({
  category,
  current,
  dragging,
  dropPosition,
  onSelect,
  onRename,
  onChangeIcon,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const itemRef = useRef(null);
  const inputRef = useRef(null);
  const skipClick = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setDraft(category.name);
  }, [category.name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitName = () => {
    setEditing(false);
    onRename(draft);
  };

  const startRename = event => {
    event.preventDefault();
    event.stopPropagation();
    setPickerOpen(false);
    setEditing(true);
  };

  const className = [
    'app-nav-item',
    dragging ? 'is-dragging' : '',
    dropPosition === 'before' ? 'drop-before' : '',
    dropPosition === 'after' ? 'drop-after' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={itemRef}
      className={className}
      aria-current={current ? 'page' : undefined}
      draggable={!editing && !pickerOpen}
      onClick={() => {
        if (skipClick.current) {
          skipClick.current = false;
          return;
        }
        onSelect();
      }}
      onDragStart={event => {
        if (editing || pickerOpen || event.target.closest('.app-nav-icon, .app-nav-label-input')) {
          event.preventDefault();
          return;
        }
        skipClick.current = true;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', category.id);
        onDragStart(category.id);
      }}
      onDragOver={event => onDragOver(event, category.id)}
      onDrop={event => onDrop(event, category.id)}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="app-nav-handle"
        title="拖动排序"
        aria-label={`拖动「${category.name}」排序`}
        draggable={false}
        onClick={event => event.stopPropagation()}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        className="app-nav-icon"
        title="更换图标"
        aria-label={`更换「${category.name}」图标`}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        draggable={false}
        onClick={event => {
          event.stopPropagation();
          setEditing(false);
          setPickerOpen(open => !open);
        }}
      >
        {category.icon}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          className="app-nav-label-input"
          value={draft}
          maxLength={CATEGORY_NAME_MAX}
          aria-label={`重命名「${category.name}」`}
          draggable={false}
          onChange={event => setDraft(event.target.value)}
          onClick={event => event.stopPropagation()}
          onBlur={commitName}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitName();
            }
            if (event.key === 'Escape') {
              setDraft(category.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="app-nav-label"
          title="双击重命名"
          draggable={false}
          onClick={event => {
            event.stopPropagation();
            if (skipClick.current) {
              skipClick.current = false;
              return;
            }
            if (current) setEditing(true);
            else onSelect();
          }}
          onDoubleClick={startRename}
        >
          {category.name}
        </button>
      )}
      {current && <div className="app-nav-marker" style={{ backgroundColor: category.color }} />}
      {pickerOpen && (
        <EmojiPicker
          value={category.icon}
          anchorRef={itemRef}
          onSelect={icon => {
            onChangeIcon(icon);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
