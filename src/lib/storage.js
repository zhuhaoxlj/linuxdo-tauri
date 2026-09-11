const prefix = 'fluxdo:';

export function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(prefix + key);
    return value == null ? fallback : JSON.parse(value);
  } catch { return fallback; }
}

export function writeLocal(key, value) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('fluxdo:storage', { detail: key }));
}

export const draftKey = username => `drafts:${username || 'guest'}`;
export const historyKey = username => `history:${username || 'guest'}`;

export function saveDraft(username, id, draft) {
  const drafts = readLocal(draftKey(username), {});
  if (!draft.raw?.trim() && !draft.title?.trim()) delete drafts[id];
  else drafts[id] = { ...draft, id, updatedAt: new Date().toISOString() };
  writeLocal(draftKey(username), drafts);
}

export function removeDraft(username, id) {
  const drafts = readLocal(draftKey(username), {});
  delete drafts[id];
  writeLocal(draftKey(username), drafts);
}

export function recordVisit(username, topic, postNumber = 1) {
  const key = historyKey(username);
  const history = readLocal(key, []).filter(item => item.id !== topic.id);
  history.unshift({ id: topic.id, title: topic.title, category_id: topic.category_id, postNumber, visitedAt: new Date().toISOString() });
  writeLocal(key, history.slice(0, 500));
}
