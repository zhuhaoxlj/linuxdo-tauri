import React, { useEffect, useRef, useState } from 'react';
import { CATEGORY_NAME_MAX } from '../../modules/board/lib/categories';
import EmojiPicker from './EmojiPicker';

export default function AppNavItem({ category, current, onSelect, onRename, onChangeIcon }) {
  const itemRef = useRef(null);
  const inputRef = useRef(null);
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

  return (
    <div
      ref={itemRef}
      className="app-nav-item"
      aria-current={current ? 'page' : undefined}
      onClick={onSelect}
    >
      <button
        type="button"
        className="app-nav-icon"
        title="更换图标"
        aria-label={`更换「${category.name}」图标`}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
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
          onClick={event => {
            event.stopPropagation();
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
