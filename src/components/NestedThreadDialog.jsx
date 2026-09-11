import React, { useEffect, useState } from 'react';
import { LoaderCircle, PlusCircle } from 'lucide-react';
import { fetchNestedChildren } from '../lib/useNestedTopic';
import { mergeNodes } from '../lib/nestedPosts';
import Dialog from './Dialog';
import NestedPost from './NestedPost';

// 深层子树弹框：嵌套达到最大深度后，从该楼层以下以 depth 0 重新渲染（对应 FluxDO nested_thread_sheet.dart）
export default function NestedThreadDialog({ node, topic, sort = 'old', maxDepth = 10, onCompose, onClose }) {
  const [children, setChildren] = useState(node.children);
  const [hasMore, setHasMore] = useState(node.hasMoreChildren);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expansion, setExpansion] = useState(() => new Map());
  const toggleExpansion = (postNumber, expanded) => setExpansion(current => new Map(current).set(postNumber, expanded));
  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await fetchNestedChildren(topic.id, node.post.post_number, { sort, page, depth: 1 });
      setChildren(current => mergeNodes(current, data.children));
      setHasMore(data.hasMore);
      setPage(data.page + 1);
    } catch { /* 保留当前状态，可再次点击重试 */ } finally { setLoading(false); }
  };
  const empty = node.children.length === 0 && node.directReplyCount > 0;
  useEffect(() => { if (empty) loadMore(); }, []);

  return <Dialog title={'@' + node.post.username + ' · 继续此主题'} wide onClose={onClose}>
    <div className="nested-thread-body post-tree">
      {children.map((child, index) => <NestedPost key={child.post.id} node={child} topic={topic} depth={0} maxDepth={maxDepth} isLastChild={index === children.length - 1 && !hasMore} expansion={expansion} onToggleExpansion={toggleExpansion} sort={sort} onCompose={onCompose} />)}
      {hasMore && <button className="button secondary load-posts" type="button" disabled={loading} onClick={loadMore}>{loading ? <LoaderCircle className="spin" size={16} /> : <PlusCircle size={16} />}{loading ? '正在加载…' : '加载更多回复'}</button>}
      {!children.length && !loading && !hasMore && <p className="muted" style={{ padding: '0 22px 22px' }}>这里暂时没有回复。</p>}
    </div>
  </Dialog>;
}
