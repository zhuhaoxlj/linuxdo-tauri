export function readingProgress(visiblePostNumbers, totalPosts) {
  const currentPost = visiblePostNumbers.length ? Math.max(...visiblePostNumbers) : 1;
  const progress = totalPosts > 0 ? Math.min(100, Math.max(0, currentPost / totalPosts * 100)) : 0;
  return { currentPost, progress };
}
