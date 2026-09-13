import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function ImageThumbnail({ src, index }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="kanban-image-open"
        aria-label={`查看第 ${index + 1} 张图片`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <img src={src} alt="" draggable={false} />
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          className="kanban-image-preview"
          aria-label="图片预览"
          onCancel={event => { event.preventDefault(); setOpen(false); }}
          onClick={event => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}
        >
          <button
            type="button"
            className="kanban-image-preview-close"
            aria-label="关闭图片预览"
            title="关闭（Esc）"
            onClick={() => setOpen(false)}
          >
            <X size={22} />
          </button>
          <img className="kanban-image-full" src={src} alt={`第 ${index + 1} 张图片`} draggable={false} />
        </dialog>
      )}
    </>
  );
}
