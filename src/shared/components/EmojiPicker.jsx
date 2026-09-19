import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { normalizeCategoryIcon } from '../../modules/board/lib/categories';

const EMOJI_GROUPS = [
  { name: '常用', emojis: ['🏠', '🌟', '💼', '📚', '☁️', '🎮', '🐧', '⭐', '🔥', '💡', '📌', '🎯', '✅', '❤️', '⚡', '🌈'] },
  { name: '生活', emojis: ['☀️', '🌙', '🍀', '🌸', '🍎', '☕', '🏃', '🧘', '🐶', '🐱', '✈️', '🎵', '🛒', '🏡', '🍳', '🌿'] },
  { name: '工作', emojis: ['💻', '📊', '📝', '📅', '🗂️', '⚙️', '🧪', '🔬', '🏗️', '📈', '📎', '🧠', '📬', '🛠️'] },
  { name: '知识', emojis: ['📖', '🔍', '✏️', '🧩', '🔖', '🎓', '📰', '🗺️', '🔭', '💬'] },
  { name: '娱乐', emojis: ['🎬', '🎧', '🎲', '🕹️', '🎨', '📷', '🍿', '🏆', '🎸', '📺'] },
];

export default function EmojiPicker({ value, onSelect, onClose, anchorRef }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const [custom, setCustom] = useState('');

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 276;
    const height = 340;
    let left = rect.right + 8;
    let top = rect.top;
    if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 8);
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
    setPosition({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    inputRef.current?.focus();
    const onPointerDown = event => {
      if (dialogRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorRef, onClose]);

  const submitCustom = event => {
    event.preventDefault();
    const icon = normalizeCategoryIcon(custom, '');
    if (!icon) return;
    onSelect(icon);
  };

  return (
    <div
      ref={dialogRef}
      className="app-emoji-picker"
      role="dialog"
      aria-label="选择看板图标"
      style={{ top: position.top, left: position.left }}
      onClick={event => event.stopPropagation()}
    >
      <form className="app-emoji-custom" onSubmit={submitCustom}>
        <input
          ref={inputRef}
          value={custom}
          onChange={event => setCustom(event.target.value)}
          aria-label="输入或粘贴 emoji"
          placeholder="输入或粘贴 emoji"
        />
        <button type="submit">使用</button>
      </form>
      <div className="app-emoji-groups">
        {EMOJI_GROUPS.map(group => (
          <section key={group.name}>
            <h3>{group.name}</h3>
            <div className="app-emoji-grid">
              {group.emojis.map(emoji => (
                <button
                  key={`${group.name}-${emoji}`}
                  type="button"
                  className={emoji === value ? 'is-selected' : undefined}
                  aria-label={`选择 ${emoji}`}
                  onClick={() => onSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
