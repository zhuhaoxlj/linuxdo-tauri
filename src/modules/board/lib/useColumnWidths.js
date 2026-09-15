import { useCallback, useRef, useState } from 'react';
import { writeSharedValue } from '../../../shared/sharedStorage';
import { COLUMN_WIDTHS_KEY, clampColumnWidth, parseColumnWidths } from './columnWidths';

function readStoredWidths() {
  try {
    return parseColumnWidths(localStorage.getItem(COLUMN_WIDTHS_KEY));
  } catch (error) {
    console.error('Failed to load column widths:', error);
    return {};
  }
}

// 拖动过程中只更新内存，松手时才写入（本机 localStorage + 开发版/正式版共享文件）
export function useColumnWidths() {
  const [widths, setWidths] = useState(readStoredWidths);
  const latest = useRef(widths);

  const resize = useCallback((columnId, width) => {
    const next = { ...latest.current, [columnId]: clampColumnWidth(width) };
    latest.current = next;
    setWidths(next);
  }, []);

  const commit = useCallback(() => {
    try {
      writeSharedValue(COLUMN_WIDTHS_KEY, JSON.stringify(latest.current));
    } catch (error) {
      console.error('Failed to save column widths:', error);
    }
  }, []);

  return { widths, resize, commit };
}
