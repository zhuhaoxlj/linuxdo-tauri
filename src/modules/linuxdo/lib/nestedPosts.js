// 树状视图（树形回复）数据解析。数据来自 linux.do 服务端 Discourse nested-topic
// 插件端点 /n/topic/*.json，结构与 FluxDO lib/models/nested_topic.dart 对应。

export function parseNestedNode(json) {
  const children = (json?.children || []).map(parseNestedNode);
  const directReplyCount = json?.direct_reply_count || 0;
  return {
    post: json,
    children,
    directReplyCount,
    totalDescendantCount: json?.total_descendant_count || 0,
    isDeletedPlaceholder: Boolean(json?.deleted_post_placeholder),
    // 服务端每层只预加载一页子回复，多出的需要懒加载
    hasMoreChildren: directReplyCount > children.length,
  };
}

export function parseNestedRoots(json) {
  return {
    topic: json?.topic || null,
    opPost: json?.op_post || null,
    sort: json?.sort || 'old',
    roots: (json?.roots || []).map(parseNestedNode),
    hasMoreRoots: Boolean(json?.has_more_roots),
    page: json?.page || 0,
  };
}

export function parseNestedContext(json) {
  const ancestorChain = json?.ancestor_chain || [];
  return {
    topic: json?.topic || null,
    opPost: json?.op_post || null,
    ancestorChain,
    ancestorsTruncated: Boolean(json?.ancestors_truncated),
    targetPost: parseNestedNode(json?.target_post),
    topAncestorPostNumber: ancestorChain[0]?.post_number || null,
  };
}

// 祖先逐层包裹目标帖，构成 context 定位视图渲染用的单链根节点
export function buildContextChain(context) {
  let chain = context.targetPost;
  for (let index = context.ancestorChain.length - 1; index >= 0; index--) {
    const post = context.ancestorChain[index];
    chain = { post, children: [chain], directReplyCount: 1, totalDescendantCount: 0, isDeletedPlaceholder: false, hasMoreChildren: false };
  }
  return chain;
}

export function parseNestedChildren(json) {
  return {
    children: (json?.children || []).map(parseNestedNode),
    hasMore: Boolean(json?.has_more),
    page: json?.page || 0,
  };
}

// 折叠条显示的回复数：优先展示整棵子树的总数
export function replyCount(node) {
  const count = node.totalDescendantCount > 0 ? node.totalDescendantCount : node.directReplyCount;
  return count > 0 ? count : node.children.length;
}

// 收集展开状态下可见的帖子，作为阅读进度的观察列表；
// 卡片内部懒加载的子回复不在 provider 数据里，不参与统计（与 FluxDO 一致）。
export function visiblePosts(nodes, expansion = new Map(), acc = []) {
  for (const node of nodes) {
    acc.push({ id: node.post.id, post_number: node.post.post_number });
    const expanded = expansion.get(node.post.post_number) ?? node.children.length > 0;
    if (expanded && node.children.length) visiblePosts(node.children, expansion, acc);
  }
  return acc;
}

export function mergeNodes(existing, incoming) {
  const seen = new Set(existing.map(node => node.post.id));
  return [...existing, ...incoming.filter(node => !seen.has(node.post.id))];
}

// 用平铺帖子流在前端构建临时树：nested 接口返回前先渲染，返回后无缝替换。
// 1 楼（OP）不进树，由列表单独渲染；回复 1 楼即回复主题，属于根回复；
// 父楼层不在已加载集合中的回复临时按顶层显示。directReplyCount 未知（记 0），
// 卡片的折叠条与懒加载判断会回退到已加载的 children。
export function buildProvisionalTree(posts) {
  const nodes = new Map();
  for (const post of posts) {
    if (post.post_number === 1) continue;
    nodes.set(post.post_number, { post, children: [], directReplyCount: 0, totalDescendantCount: 0, isDeletedPlaceholder: false, hasMoreChildren: false, provisional: true });
  }
  const roots = [];
  for (const node of nodes.values()) {
    const replyTo = node.post.reply_to_post_number;
    const parent = replyTo && replyTo > 1 ? nodes.get(replyTo) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const order = list => { list.sort((left, right) => left.post.post_number - right.post.post_number); list.forEach(node => order(node.children)); };
  order(roots);
  return roots;
}
