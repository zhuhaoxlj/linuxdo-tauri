import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNestedNode,
  parseNestedRoots,
  parseNestedContext,
  buildContextChain,
  parseNestedChildren,
  replyCount,
  visiblePosts,
  mergeNodes,
  buildProvisionalTree,
} from '../src/lib/nestedPosts.js';

const post = (id, postNumber, extra = {}) => ({ id, post_number: postNumber, username: 'user' + postNumber, cooked: '<p>' + postNumber + '</p>', ...extra });

test('parseNestedNode 递归解析子树并计算懒加载标记', () => {
  const node = parseNestedNode({
    ...post(10, 2),
    direct_reply_count: 3,
    total_descendant_count: 7,
    children: [
      { ...post(11, 3), direct_reply_count: 1, children: [post(12, 4)] },
    ],
  });
  assert.equal(node.post.id, 10);
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].children[0].post.id, 12);
  assert.equal(node.directReplyCount, 3);
  assert.equal(node.totalDescendantCount, 7);
  assert.equal(node.hasMoreChildren, true); // 3 条直回只预载 1 条
  assert.equal(node.children[0].hasMoreChildren, false);
  assert.equal(parseNestedNode({ ...post(9, 5), deleted_post_placeholder: true }).isDeletedPlaceholder, true);
  assert.equal(parseNestedNode(undefined).children.length, 0);
});

test('parseNestedRoots 映射根列表分页字段', () => {
  const data = parseNestedRoots({
    topic: { id: 1, title: '话题' },
    op_post: post(1, 1),
    sort: 'new',
    roots: [{ ...post(2, 2), direct_reply_count: 0 }],
    has_more_roots: true,
    page: 0,
  });
  assert.equal(data.opPost.post_number, 1);
  assert.equal(data.roots.length, 1);
  assert.equal(data.hasMoreRoots, true);
  assert.equal(data.sort, 'new');
  assert.equal(parseNestedRoots(null).roots.length, 0);
});

test('buildContextChain 用祖先链逐层包裹目标帖', () => {
  const context = parseNestedContext({
    op_post: post(1, 1),
    ancestor_chain: [post(2, 2), post(3, 3)],
    ancestors_truncated: true,
    target_post: { ...post(4, 4), direct_reply_count: 1, children: [post(5, 5)] },
  });
  assert.equal(context.topAncestorPostNumber, 2);
  assert.equal(context.ancestorsTruncated, true);
  const chain = buildContextChain(context);
  // 单链：#2 → #3 → #4（目标，带自己的子树）
  assert.equal(chain.post.post_number, 2);
  assert.equal(chain.children.length, 1);
  assert.equal(chain.children[0].post.post_number, 3);
  assert.equal(chain.children[0].children[0].post.post_number, 4);
  assert.equal(chain.children[0].children[0].children[0].post.post_number, 5);
});

test('parseNestedChildren 映射子回复分页字段', () => {
  const data = parseNestedChildren({ children: [post(6, 6)], has_more: true, page: 1 });
  assert.equal(data.children.length, 1);
  assert.equal(data.hasMore, true);
  assert.equal(data.page, 1);
  assert.deepEqual(parseNestedChildren(null), { children: [], hasMore: false, page: 0 });
});

test('replyCount 优先展示整棵子树的总数', () => {
  const node = parseNestedNode({ ...post(1, 1), direct_reply_count: 2, total_descendant_count: 9 });
  assert.equal(replyCount(node), 9);
  assert.equal(replyCount(parseNestedNode({ ...post(1, 1), direct_reply_count: 2 })), 2);
  assert.equal(replyCount(parseNestedNode({ ...post(1, 1), children: [post(2, 2)] })), 1);
});

test('visiblePosts 只收集展开状态下的可见楼层', () => {
  const tree = [
    parseNestedNode({
      ...post(1, 1),
      direct_reply_count: 2,
      children: [
        { ...post(2, 2), direct_reply_count: 1, children: [post(3, 3)] },
        post(4, 4),
      ],
    }),
    parseNestedNode(post(5, 5)),
  ];
  // 默认：有预加载子节点就展开
  const seen = visiblePosts(tree);
  assert.deepEqual(seen.map(item => item.post_number), [1, 2, 3, 4, 5]);
  // 折叠 #1 后其子树不可见
  const collapsed = visiblePosts(tree, new Map([[1, false]]));
  assert.deepEqual(collapsed.map(item => item.post_number), [1, 5]);
  // 折叠 #2 后孙层不可见
  const partial = visiblePosts(tree, new Map([[2, false]]));
  assert.deepEqual(partial.map(item => item.post_number), [1, 2, 4, 5]);
});

test('mergeNodes 按帖子 id 去重合并', () => {
  const existing = [parseNestedNode(post(1, 1))];
  const merged = mergeNodes(existing, [parseNestedNode(post(1, 1)), parseNestedNode(post(2, 2))]);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].post.id, 2);
});

test('buildProvisionalTree 用平铺帖子流构建前端临时树', () => {
  const roots = buildProvisionalTree([
    post(1, 1), // OP 不进树，由列表单独渲染
    post(2, 2, { reply_to_post_number: 1 }), // 回复 1 楼 = 回复主题 → 根回复
    post(3, 3, { reply_to_post_number: 2 }),
    post(4, 4, { reply_to_post_number: 1 }),
    post(5, 5, { reply_to_post_number: 99 }), // 父楼层不在已加载集合 → 临时顶层
  ]);
  assert.deepEqual(roots.map(node => node.post.post_number), [2, 4, 5]);
  assert.equal(roots[0].children.length, 1);
  assert.equal(roots[0].children[0].post.post_number, 3);
  assert.equal(roots[0].directReplyCount, 0); // 服务端计数未知，卡片回退到已加载数量
  assert.equal(roots[0].provisional, true);
});
