export const COLUMN_WIDTHS_KEY = 'fluxdo:board-column-widths';
export const DEFAULT_COLUMN_WIDTH = 280;
export const MIN_COLUMN_WIDTH = 200;
export const MAX_COLUMN_WIDTH = 720;
export const COLUMN_WIDTH_STEP = 16;

export function clampColumnWidth(width) {
  if (!Number.isFinite(width)) return DEFAULT_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

// 只保留仍然存在的列，并丢掉非法宽度，避免历史数据把列拉成不可用的尺寸
export function parseColumnWidths(raw, columns) {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const widths = {};
  for (const [id, value] of Object.entries(source)) {
    if (columns?.length && !columns.some(column => column.id === id)) continue;
    const width = Number(value);
    if (!Number.isFinite(width)) continue;
    widths[id] = clampColumnWidth(width);
  }
  return widths;
}
