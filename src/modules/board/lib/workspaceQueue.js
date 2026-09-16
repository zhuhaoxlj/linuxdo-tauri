export function createWorkspaceQueue() {
  let tail = Promise.resolve();
  return {
    run(operation) {
      const current = tail.then(operation);
      tail = current.catch(() => undefined);
      return current;
    },
    idle() { return tail; },
  };
}

export function retainConcurrentNoteEdits(next, beforeNotes, currentNotes) {
  if (currentNotes === beforeNotes) return next;
  const before = new Map(beforeNotes.map(note => [note.id, note]));
  const merged = new Map(next.notes.map(note => [note.id, note]));
  for (const note of currentNotes) {
    if (before.get(note.id) !== note) merged.set(note.id, note);
  }
  return { ...next, notes: [...merged.values()] };
}
