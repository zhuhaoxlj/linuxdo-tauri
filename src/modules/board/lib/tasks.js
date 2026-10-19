export function sortPinnedTasks(tasks) {
  return [...tasks].sort((first, second) => Number(Boolean(second.pinned)) - Number(Boolean(first.pinned)));
}

// 子任务保存在主任务里，随卡片一起同步，不单独建立日程。
export function normalizeSubtasks(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === 'string') {
      return { id: `subtask-${index}`, title: item, done: false, createdAt: null, doneAt: null };
    }
    const source = item && typeof item === 'object' ? item : {};
    return {
      id: typeof source.id === 'string' && source.id ? source.id : `subtask-${index}`,
      title: typeof source.title === 'string' ? source.title : String(source.title ?? ''),
      done: Boolean(source.done),
      createdAt: source.createdAt || null,
      doneAt: source.doneAt ?? null,
    };
  });
}

export function subtaskProgress(subtasks) {
  const list = normalizeSubtasks(subtasks);
  return { total: list.length, done: list.filter(item => item.done).length };
}

export function addSubtask(subtasks, title) {
  const text = String(title ?? '').trim();
  if (!text) return null;
  const created = { id: nextSubtaskId(), title: text, done: false, createdAt: new Date().toISOString(), doneAt: null };
  return [...normalizeSubtasks(subtasks), created];
}

export function toggleSubtask(subtasks, id) {
  const now = new Date().toISOString();
  return normalizeSubtasks(subtasks).map(item => item.id !== id ? item : {
    ...item, done: !item.done, doneAt: item.done ? null : now,
  });
}

export function editSubtask(subtasks, id, updates) {
  return normalizeSubtasks(subtasks).map(item => {
    if (item.id !== id) return item;
    const title = String(updates.title ?? item.title).trim();
    return { ...item, ...updates, title: title || item.title };
  });
}

export function deleteSubtask(subtasks, id) {
  return normalizeSubtasks(subtasks).filter(item => item.id !== id);
}

function nextSubtaskId() {
  const random = globalThis.crypto?.randomUUID?.();
  return random || `subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
