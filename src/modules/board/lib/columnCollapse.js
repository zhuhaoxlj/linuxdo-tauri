export const COLUMN_COLLAPSED_KEY = 'fluxdo:board-column-collapsed';

// 已完成的清单默认收起：done 列首次打开应用时只显示列头，点开后再展开
export const DEFAULT_COLUMN_COLLAPSED = { done: true };

// 只保存用户显式切换过的列，其余列继续跟随默认值，新增列也能拿到默认状态
export function parseColumnCollapsed(raw, columns) {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const state = {};
  for (const [id, value] of Object.entries(source)) {
    if (columns?.length && !columns.some(column => column.id === id)) continue;
    if (typeof value !== 'boolean') continue;
    state[id] = value;
  }
  return state;
}

export function isColumnCollapsed(state, columnId) {
  const value = state?.[columnId];
  if (typeof value === 'boolean') return value;
  return Boolean(DEFAULT_COLUMN_COLLAPSED[columnId]);
}

export function toggleColumnCollapsed(state, columnId) {
  return { ...state, [columnId]: !isColumnCollapsed(state, columnId) };
}
