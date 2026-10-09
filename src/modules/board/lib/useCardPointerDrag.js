import { useEffect, useRef, useState } from 'react';

// Avoid HTML drag-and-drop: Linux WebKitGTK may never deliver dragstart/drop.
export function useCardPointerDrag({ onStart, onHover, onDrop, onEnd }) {
  const callbacks = useRef({ onStart, onHover, onDrop, onEnd });
  callbacks.current = { onStart, onHover, onDrop, onEnd };
  const cleanup = useRef(null);
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState(null);

  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (event, task) => {
    if (event.button !== 0 || event.isPrimary === false
      || event.target.closest('button, textarea, input, a, dialog, [role="menu"]')) return;
    cleanup.current?.();
    const source = event.currentTarget;
    const bounds = source.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    let point = origin;
    let active = false;
    let frame;
    let ended = false;

    const hit = () => document.elementFromPoint(point.x, point.y);
    const draw = () => {
      const node = hit();
      const scrollable = node?.closest('.kanban-cards, .kanban-columns, .day-timeline-scroll');
      if (scrollable) {
        const rect = scrollable.getBoundingClientRect();
        if (point.y < rect.top + 32) scrollable.scrollTop -= 10;
        else if (point.y > rect.bottom - 32) scrollable.scrollTop += 10;
        const columns = node.closest('.kanban-columns');
        if (columns) {
          const region = columns.getBoundingClientRect();
          if (point.x < region.left + 32) columns.scrollLeft -= 10;
          else if (point.x > region.right - 32) columns.scrollLeft += 10;
        }
      }
      callbacks.current.onHover(task.id, hit(), point.y);
      setPreview({ task, width: bounds.width,
        x: point.x - (origin.x - bounds.left), y: point.y - (origin.y - bounds.top) });
      frame = requestAnimationFrame(draw);
    };

    const finish = (current, canceled = false) => {
      if (ended || (current?.pointerId != null && current.pointerId !== pointerId)) return;
      ended = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
      document.body.classList.remove('kanban-pointer-dragging');
      setPreview(null);
      cleanup.current = null;
      if (active) {
        suppressClickUntil.current = Date.now() + 300;
        if (!canceled) {
          if (current) point = { x: current.clientX, y: current.clientY };
          callbacks.current.onDrop(task.id, hit(), point.y);
        }
        callbacks.current.onEnd();
      }
    };
    const move = current => {
      if (current.pointerId !== pointerId) return;
      point = { x: current.clientX, y: current.clientY };
      if (!active && Math.hypot(point.x - origin.x, point.y - origin.y) < 6) return;
      current.preventDefault();
      if (!active) {
        active = true;
        source.setPointerCapture?.(pointerId);
        document.body.classList.add('kanban-pointer-dragging');
        window.getSelection()?.removeAllRanges();
        callbacks.current.onStart(task.id);
        draw();
      }
    };
    const up = current => finish(current);
    const cancel = current => finish(current, true);
    const key = current => {
      if (current.key === 'Escape') { current.preventDefault(); finish(null, true); }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    cleanup.current = () => finish(null, true);
  };

  const onClickCapture = event => {
    if (Date.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return { onPointerDown, onClickCapture, preview };
}
