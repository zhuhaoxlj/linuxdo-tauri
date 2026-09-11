import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, ListTree, LoaderCircle } from 'lucide-react';
import { visiblePosts } from '../lib/nestedPosts';
import Post from './Post';
import NestedPost from './NestedPost';

const SORTS = [['top', '热门'], ['new', '最新'], ['old', '最旧']];
const MAX_DEPTH = 10;

// 树状视图容器：OP + 排序 + 根回复树 + context 定位横幅，对应 FluxDO nested_post_list.dart。
// 展开/折叠状态以楼层号为键存在此处，跨滚动与重渲染保持。
export default function NestedPostList({ topic, nested, sort, onSortChange, onCompose, highlightPostNumber, relocateToken, onVisiblePosts, onViewFullTopic, onViewParentContext, lineStyle, onChanged }) {
  const [expansion, setExpansion] = useState(() => new Map());
  const highlightRef = useRef(null);
  const toggleExpansion = (postNumber, expanded) => setExpansion(current => { const next = new Map(current); next.set(postNumber, expanded); return next; });
  const nodes = nested.contextMode && nested.contextChain ? [nested.contextChain] : nested.roots;
  const seen = useMemo(() => visiblePosts(nodes, expansion), [nodes, expansion]);
  const identity = seen.map(item => item.id).join(',');
  useEffect(() => { onVisiblePosts?.(seen); }, [identity]);

  // context 目标定位：子树可能还在异步展开，元素未挂载时逐帧重试（对应 FluxDO _tryScrollToTarget）
  useEffect(() => {
    if (!highlightPostNumber) return undefined;
    let attempts = 0;
    let frame;
    const tick = () => {
      if (highlightRef.current) highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      else if (attempts < 20) { attempts += 1; frame = requestAnimationFrame(tick); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [highlightPostNumber, relocateToken]);

  return <div className="post-tree nested-view" data-line={lineStyle}>
    {nested.opPost && <Post post={nested.opPost} topic={topic} onCompose={onCompose} onChanged={onChanged} />}
    <div className="nested-sort" role="group" aria-label="回复排序">
      {SORTS.map(([value, label]) => <button key={value} type="button" className={sort === value ? 'active' : ''} aria-pressed={sort === value} onClick={() => onSortChange(value)}>{label}</button>)}
    </div>
    {nested.contextMode && <div className="nested-context-banner"><ListTree size={16} /><p>正在查看这一楼层的回复分支，并非完整话题。</p><div className="nested-context-actions">{onViewFullTopic && <button className="button secondary small" type="button" onClick={onViewFullTopic}><ArrowLeft size={14} />查看完整话题</button>}{nested.ancestorsTruncated && nested.topAncestorPostNumber && onViewParentContext && <button className="button secondary small" type="button" onClick={() => onViewParentContext(nested.topAncestorPostNumber)}><ArrowUp size={14} />查看更早的上下文</button>}</div></div>}
    {nodes.map((node, index) => {
      const isTarget = node.post.post_number === highlightPostNumber;
      // 命中定位的卡片带上 relocateToken，同楼层重复跳转时重建以重播高亮
      return <NestedPost key={node.post.id + (isTarget ? ':' + relocateToken : '')} node={node} topic={topic} depth={0} maxDepth={MAX_DEPTH} isLastChild={index === nodes.length - 1} expansion={expansion} onToggleExpansion={toggleExpansion} sort={sort} onCompose={onCompose} highlightPostNumber={highlightPostNumber} highlightRef={highlightRef} />;
    })}
    {!nested.contextMode && nested.hasMoreRoots && <button className="button secondary load-posts" type="button" disabled={nested.loadingMore} onClick={nested.loadMoreRoots}>{nested.loadingMore ? <LoaderCircle className="spin" size={16} /> : null}{nested.loadingMore ? '正在加载…' : '加载更多回复'}</button>}
  </div>;
}
