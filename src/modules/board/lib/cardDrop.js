// Return the insertion anchor in the visible (pinned-first) order.
export function cardDropTarget(cards, draggingId, targetId, position = 'before') {
  const moving = cards.find(card => card.id === draggingId);
  const target = cards.find(card => card.id === targetId);
  if (!moving || !target || draggingId === targetId) return null;
  // Pinned and ordinary cards retain their separate ordering groups.
  const group = cards.filter(card => card.id !== draggingId
    && card.category === target.category && card.column === target.column
    && Boolean(card.pinned) === Boolean(moving.pinned));
  const index = group.findIndex(card => card.id === targetId);
  const beforeId = index < 0
    ? (moving.pinned ? undefined : group[0]?.id)
    : position === 'after' ? group[index + 1]?.id : targetId;
  return { column: target.column, beforeId };
}

export function cardDropPosition(clientY, rect) {
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}
