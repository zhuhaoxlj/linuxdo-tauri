const MAX_LEGACY_WORKSPACE_BYTES = 8 * 1024 * 1024;

export function legacyWorkspacePayload(tasks, notes) {
  const payload = {
    tasks: Array.isArray(tasks) ? tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      content: task.content,
      tags: task.tags,
      pinned: task.pinned,
      column: task.column,
      completed: task.completed,
      category: task.category,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })) : [],
    notes: Array.isArray(notes) ? notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      body: note.body,
      summary: note.summary,
      folder: note.folder,
      type: note.type,
      status: note.status,
      sourceUrl: note.sourceUrl,
      tags: note.tags,
      pinned: note.pinned,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })) : [],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bytes > MAX_LEGACY_WORKSPACE_BYTES) {
    throw new Error('本地工作空间数据过大，无法一次导入同步空间');
  }
  return payload;
}
