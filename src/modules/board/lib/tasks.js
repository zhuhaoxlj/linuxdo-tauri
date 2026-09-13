export function sortPinnedTasks(tasks) {
  return [...tasks].sort((first, second) => Number(Boolean(second.pinned)) - Number(Boolean(first.pinned)));
}
