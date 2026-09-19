export const DEFAULT_CATEGORIES = [
  { id: 'home', name: '首页', icon: '🏠', color: '#6366f1' },
  { id: 'life', name: '生活', icon: '🌟', color: '#10b981' },
  { id: 'work', name: '工作', icon: '💼', color: '#f59e0b' },
  { id: 'knowledge', name: '知识库', icon: '📚', color: '#8b5cf6' },
  { id: 'sync', name: '同步配对', icon: '☁️', color: '#4974bb' },
  { id: 'entertainment', name: '娱乐', icon: '🎮', color: '#ec4899' },
  { id: 'linuxdo', name: 'LinuxDo', icon: '🐧', color: '#06b6d4' },
];

export const CATEGORY_NAME_MAX = 24;

function firstGrapheme(value) {
  const text = String(value || '');
  if (!text) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)[Symbol.iterator]().next().value;
    return first?.segment || '';
  }
  return Array.from(text)[0] || '';
}

export function normalizeCategoryName(value, fallback) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) return fallback;
  return [...name].slice(0, CATEGORY_NAME_MAX).join('');
}

export function normalizeCategoryIcon(value, fallback) {
  const icon = firstGrapheme(String(value || '').trim());
  return icon || fallback;
}

export function mergeCategories(stored, defaults = DEFAULT_CATEGORIES) {
  const byId = new Map(
    (Array.isArray(stored) ? stored : [])
      .filter(item => item && typeof item.id === 'string')
      .map(item => [item.id, item]),
  );
  return defaults.map(item => {
    const custom = byId.get(item.id);
    if (!custom) return { ...item };
    return {
      ...item,
      name: normalizeCategoryName(custom.name, item.name),
      icon: normalizeCategoryIcon(custom.icon, item.icon),
    };
  });
}

export function updateCategoryList(categories, id, updates) {
  return categories.map(item => {
    if (item.id !== id) return item;
    return {
      ...item,
      name: updates.name === undefined ? item.name : normalizeCategoryName(updates.name, item.name),
      icon: updates.icon === undefined ? item.icon : normalizeCategoryIcon(updates.icon, item.icon),
    };
  });
}

export const NON_TASK_BOARD_IDS = new Set(['sync', 'linuxdo']);

export function taskBoardCategories(categories, currentId) {
  return (Array.isArray(categories) ? categories : []).filter(
    item => item && item.id !== currentId && !NON_TASK_BOARD_IDS.has(item.id),
  );
}
