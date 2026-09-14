const CATEGORY_NAMES = {
  home: '首页',
  life: '生活',
  work: '工作',
  entertainment: '娱乐',
  linuxdo: 'LinuxDo',
};

const CATEGORY_IDS = Object.fromEntries(Object.entries(CATEGORY_NAMES).map(([id, name]) => [name, id]));

export function taskRecordId(task) {
  return task.syncId || (String(task.id).startsWith('linuxdo-board:') ? String(task.id) : `linuxdo-board:${task.id}`);
}

export function noteRecordId(note) {
  return note.syncId || (String(note.id).startsWith('linuxdo-note:') ? String(note.id) : `linuxdo-note:${note.id}`);
}

export function taskToRecord(task, overrides = {}) {
  const id = taskRecordId(task);
  return {
    id,
    kind: 'board_card',
    title: task.title || '',
    body: task.description || task.content || '',
    summary: '',
    folder: '',
    noteType: 'note',
    status: 'draft',
    sourceUrl: '',
    tags: Array.isArray(task.tags) ? task.tags : [],
    pinned: Boolean(task.pinned),
    boardColumn: ['inbox', 'todo', 'doing', 'done'].includes(task.column) ? task.column : task.completed ? 'done' : 'inbox',
    category: CATEGORY_NAMES[task.category] || task.category || '首页',
    trashedAt: null,
    createdAt: timestamp(task.createdAt),
    updatedAt: timestamp(task.updatedAt || task.createdAt),
    attachments: Array.isArray(task.syncAttachments) ? task.syncAttachments : [],
    serverVersion: Number(task.serverVersion) || 0,
    syncState: task.syncState || 'pending',
    ...overrides,
  };
}

export function noteToRecord(note, overrides = {}) {
  const id = noteRecordId(note);
  return {
    id,
    kind: 'note',
    title: note.title || '',
    body: note.content || note.body || '',
    summary: note.summary || '',
    folder: note.folder || '随手记',
    noteType: ['note', 'summary', 'article'].includes(note.type) ? note.type : 'note',
    status: note.status === 'ready' ? 'ready' : 'draft',
    sourceUrl: note.sourceUrl || '',
    tags: Array.isArray(note.tags) ? note.tags : [],
    pinned: Boolean(note.pinned),
    boardColumn: 'inbox',
    category: '首页',
    trashedAt: null,
    createdAt: timestamp(note.createdAt),
    updatedAt: timestamp(note.updatedAt || note.createdAt),
    attachments: Array.isArray(note.syncAttachments) ? note.syncAttachments : [],
    serverVersion: Number(note.serverVersion) || 0,
    syncState: note.syncState || 'pending',
    ...overrides,
  };
}

export function recordToTask(record, images = []) {
  return {
    id: localId(record.id, 'linuxdo-board:'),
    syncId: record.id,
    title: record.title || '',
    description: record.body || '',
    tags: record.tags || [],
    pinned: Boolean(record.pinned),
    column: record.boardColumn || 'inbox',
    completed: record.boardColumn === 'done',
    category: CATEGORY_IDS[record.category] || record.category || 'home',
    images,
    syncAttachments: record.attachments || [],
    createdAt: isoTime(record.createdAt),
    updatedAt: isoTime(record.updatedAt),
    serverVersion: record.serverVersion || 0,
    syncState: record.syncState || 'clean',
  };
}

export function recordToNote(record) {
  return {
    id: localId(record.id, 'linuxdo-note:'),
    syncId: record.id,
    title: record.title || '',
    content: record.body || '',
    summary: record.summary || '',
    folder: record.folder || '随手记',
    type: record.noteType || 'note',
    status: record.status || 'draft',
    sourceUrl: record.sourceUrl || '',
    tags: record.tags || [],
    pinned: Boolean(record.pinned),
    syncAttachments: record.attachments || [],
    createdAt: isoTime(record.createdAt),
    updatedAt: isoTime(record.updatedAt),
    serverVersion: record.serverVersion || 0,
    syncState: record.syncState || 'clean',
  };
}

export function mergeWorkspace(current, records, imageMap = new Map(), protectedIds = new Set()) {
  const tasks = new Map(current.tasks.map(task => [taskRecordId(task), task]));
  const notes = new Map(current.notes.map(note => [noteRecordId(note), note]));
  const tombstones = new Map((current.tombstones || []).map(record => [record.id, record]));

  for (const record of records) {
    if (protectedIds.has(record.id)) continue;
    const target = record.kind === 'board_card' ? tasks : notes;
    const local = target.get(record.id);
    const deleted = tombstones.get(record.id);
    const localVersion = Math.max(Number(local?.serverVersion) || 0, Number(deleted?.serverVersion) || 0);
    const remoteVersion = Number(record.serverVersion) || 0;
    const localTime = Math.max(
      local ? timestamp(local.updatedAt || local.createdAt) : 0,
      deleted ? timestamp(deleted.updatedAt || deleted.trashedAt) : 0,
    );
    if (localVersion > remoteVersion || (localVersion === remoteVersion && localTime > record.updatedAt)) continue;
    if (record.trashedAt) {
      target.delete(record.id);
      tombstones.set(record.id, record);
      continue;
    }
    tombstones.delete(record.id);
    target.set(record.id, record.kind === 'board_card'
      ? recordToTask(record, imageMap.get(record.id) || local?.images || [])
      : recordToNote(record));
  }
  return { tasks: [...tasks.values()], notes: [...notes.values()], tombstones: [...tombstones.values()] };
}

export function detachWorkspace(current) {
  return {
    tasks: current.tasks.map(removeSyncMetadata),
    notes: current.notes.map(removeSyncMetadata),
    tombstones: [],
  };
}

export function resolveConflict(local, remote, now = Date.now(), conflictId = crypto.randomUUID()) {
  if (local.trashedAt) {
    return {
      primary: { ...local, serverVersion: remote.serverVersion, syncState: 'pending' },
      conflict: { ...remote, id: conflictId, title: `${remote.title || '无标题'}（冲突副本）`, conflictOf: local.id, trashedAt: null, serverVersion: 0, updatedAt: now, syncState: 'pending' },
      retry: { ...local, serverVersion: remote.serverVersion, syncState: 'pending' },
    };
  }
  return {
    primary: remote,
    conflict: { ...local, id: conflictId, title: `${local.title || '无标题'}（冲突副本）`, conflictOf: local.id, serverVersion: 0, updatedAt: now, syncState: 'pending' },
  };
}

export function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function localId(id, prefix) {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function isoTime(value) {
  return new Date(timestamp(value)).toISOString();
}

function removeSyncMetadata(item) {
  const { syncId, syncAttachments, serverVersion, syncState, ...local } = item;
  return local;
}
