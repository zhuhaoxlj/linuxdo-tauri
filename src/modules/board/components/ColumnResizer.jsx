import React from 'react';
import { COLUMN_WIDTH_STEP, DEFAULT_COLUMN_WIDTH } from '../lib/columnWidths';

// 列右边缘的拖拽手柄：鼠标拖动改宽度，键盘左右键 / Home 走同一套回调
export default function ColumnResizer({ width, onResize, onCommit }) {
  const startDrag = event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let moved = false;
    const onMove = moveEvent => {
      moved = true;
      onResize(startWidth + (moveEvent.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('kanban-resizing');
      if (moved) onCommit();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.classList.add('kanban-resizing');
  };

  const onKeyDown = event => {
    const nudge = delta => {
      event.preventDefault();
      onResize(width + delta);
      onCommit();
    };
    if (event.key === 'ArrowLeft') nudge(-COLUMN_WIDTH_STEP);
    else if (event.key === 'ArrowRight') nudge(COLUMN_WIDTH_STEP);
    else if (event.key === 'Home') nudge(DEFAULT_COLUMN_WIDTH - width);
  };

  return (
    <div
      className="kanban-column-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整列宽"
      aria-valuenow={width}
      tabIndex={0}
      onMouseDown={startDrag}
      onKeyDown={onKeyDown}
    />
  );
}
