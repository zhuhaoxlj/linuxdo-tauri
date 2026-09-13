import React, { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Copy, CornerDownRight, Heart, LoaderCircle, Pencil, PlusCircle, Quote, Reply, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText } from '../lib/api';
import { fetchNestedChildren } from '../lib/useNestedTopic';
import { mergeNodes, replyCount } from '../lib/nestedPosts';
import { number, relativeTime } from '../lib/format';
import { Avatar } from './Common';
import Cooked from './Cooked';
import Dialog from './Dialog';
import NestedThreadDialog from './NestedThreadDialog';

// 树状视图的递归帖子卡片，对应 FluxDO nested_post_card.dart。
// 布局：头像列（展开时带贯穿竖线，竖线区域可点击折叠）+ 内容列，
// 子回复渲染在 nested-children 缩进区中，逐层递归。
export default function NestedPost({ node, topic, depth = 0, maxDepth = 10, isLastChild = true, expansion, onToggleExpansion, sort = 'old', onCompose, highlightPostNumber, highlightRef }) {
  const { user, requestLogin } = useAuth();
  const { notify } = useApp();
  const queries = useQueryClient();
  const post = node.post;
  const [extraChildren, setExtraChildren] = useState([]);
  const [hasMore, setHasMore] = useState(node.hasMoreChildren);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const like = post.actions_summary?.find(action => action.id === 2);
  const [likeState, setLikeState] = useState(() => ({ acted: Boolean(like?.acted), count: like?.count || 0 }));
  useEffect(() => { setLikeState({ acted: Boolean(like?.acted), count: like?.count || 0 }); }, [post.id]);
  const children = mergeNodes(node.children, extraChildren);
  const hasReplies = node.directReplyCount > 0 || children.length > 0;
  const atMaxDepth = depth >= maxDepth;
  const expanded = expansion.get(post.post_number) ?? (node.children.length > 0 && !atMaxDepth);
  const deleted = node.isDeletedPlaceholder || Boolean(post.deleted_at);
  const isSmallAction = !deleted && (post.post_type === 3 || Boolean(post.action_code));
  const isOp = post.post_number === 1 || topic.details?.created_by?.username === post.username;
  const isTarget = highlightPostNumber === post.post_number;

  const mutation = useMutation({
    mutationFn: operation => operation(),
    onSuccess: async () => {
      await queries.invalidateQueries({ queryKey: ['topic', String(topic.id)] });
      queries.invalidateQueries({ queryKey: ['nested-topic', String(topic.id)] });
    },
    onError: error => notify(errorText(error)),
  });
  const act = operation => (user ? mutation.mutate(operation) : requestLogin());
  const compose = async (kind, quote = false) => {
    if (!user) return requestLogin();
    try {
      let raw = '';
      if (kind === 'edit' || quote) {
        const selected = quote ? window.getSelection()?.toString() : '';
        raw = selected || (await api.get('/posts/' + post.id + '.json')).raw || '';
      }
      if (quote) raw = '[quote="' + post.username + ', post:' + post.post_number + ', topic:' + topic.id + '"]\n' + raw + '\n[/quote]\n\n';
      onCompose({ kind, topicId: topic.id, postId: post.id, replyTo: post.post_number, raw });
    } catch (error) { notify(errorText(error)); }
  };
  const toggleLike = () => {
    if (!user) return requestLogin();
    const previous = likeState;
    const next = { acted: !previous.acted, count: previous.count + (previous.acted ? -1 : 1) };
    setLikeState(next);
    const request = previous.acted
      ? api.delete('/post_actions/' + post.id, { post_action_type_id: 2 })
      : api.post('/post_actions', { id: post.id, post_action_type_id: 2 });
    request.then(() => queries.invalidateQueries({ queryKey: ['topic', String(topic.id)] })).catch(error => { setLikeState(previous); notify(errorText(error)); });
  };
  const loadMore = async () => {
    if (loadingMore || atMaxDepth) return;
    setLoadingMore(true);
    try {
      const data = await fetchNestedChildren(topic.id, post.post_number, { sort, page, depth: depth + 1 });
      setExtraChildren(current => mergeNodes(current, data.children));
      setHasMore(data.hasMore);
      setPage(data.page + 1);
    } catch { /* 保留当前状态，可再次点击重试 */ } finally { setLoadingMore(false); }
  };
  const toggle = () => {
    const next = !expanded;
    onToggleExpansion(post.post_number, next);
    if (next && !children.length && node.directReplyCount > 0) loadMore();
  };

  const showChildren = !atMaxDepth && expanded && !deleted && (children.length > 0 || loadingMore || hasMore);
  const showCollapsed = !atMaxDepth && !deleted && !expanded && hasReplies;
  const showContinue = !deleted && atMaxDepth && hasReplies;
  const headLink = '/user/' + encodeURIComponent(post.username);
  const className = ['nested-post', depth > 0 && 'nested-child', depth > 0 && !isLastChild && 'chain-line', showChildren && 'open-children', deleted && 'deleted', isSmallAction && 'small-action', isTarget && 'highlight'].filter(Boolean).join(' ');

  return <article ref={isTarget ? highlightRef : undefined} className={className} id={'post-' + post.post_number} data-post-number={post.post_number}>
    <div className="nested-post-row">
      {deleted
        ? <span className="nested-gutter deleted" aria-hidden="true"><Trash2 size={15} /></span>
        : <span className="nested-gutter"><Link to={headLink} aria-label={post.username + ' 的头像'}><Avatar user={post} size={30} /></Link>{showChildren && <button className="nested-line-hit" type="button" aria-label={expanded ? '折叠回复' : '展开回复'} title={expanded ? '折叠回复' : '展开回复'} onClick={toggle} />}</span>}
      {deleted
        ? <p className="muted nested-deleted-label">此帖子已删除</p>
        : showCollapsed
          ? <button className="nested-collapsed-bar" type="button" onClick={toggle}><PlusCircle size={15} />{post.username}<i>·</i>{replyCount(node)} 条回复</button>
          : <div className="nested-content">
              <header className="nested-post-header">
                <Link to={headLink}>{post.username}</Link>
                {isOp && <em className="nested-op">OP</em>}
                {post.reply_to_user?.username && <span className="nested-reply-to"><CornerDownRight size={12} />{post.reply_to_user.username}</span>}
                <span className="nested-header-end"><time title={new Date(post.created_at).toLocaleString('zh-CN')}>{relativeTime(post.created_at)}</time>{post.read === false && <i className="nested-unread" aria-label="未读" />}</span>
              </header>
              <Cooked html={post.cooked || ''} className="nested-cooked" />
              {!isSmallAction && <footer className="nested-post-actions">
                <button className={'icon-button like-button ' + (likeState.acted ? 'is-liked' : '')} aria-label={likeState.acted ? '取消点赞' : '点赞'} aria-pressed={likeState.acted} disabled={user && !likeState.acted && (like?.can_act === false || user.username === post.username)} onClick={toggleLike}><Heart size={15} fill={likeState.acted ? 'currentColor' : 'none'} />{number(likeState.count)}</button>
                <span className="nested-action-spacer" />
                {!topic.closed && <button className="icon-button" aria-label="引用回复" title="引用回复" onClick={() => compose('reply', true)}><Quote size={15} /></button>}
                <button className="icon-button" aria-label="复制帖子链接" title="复制链接" onClick={() => navigator.clipboard.writeText('https://linux.do/t/' + topic.id + '/' + post.post_number).then(() => notify('链接已复制')).catch(() => notify('复制失败，请使用话题的浏览器入口'))}><Copy size={15} /></button>
                {post.can_edit && <button className="icon-button" aria-label="编辑帖子" title="编辑帖子" onClick={() => compose('edit')}><Pencil size={15} /></button>}
                {post.can_delete && <button className="icon-button" aria-label="删除帖子" title="删除帖子" onClick={() => setDeleteOpen(true)}><Trash2 size={15} /></button>}
                {(post.can_accept_answer || post.can_unaccept_answer) && <button className="icon-button" aria-label={post.accepted_answer ? '取消采纳' : '采纳回答'} disabled={mutation.isPending} onClick={() => act(() => api.post('/solution/' + (post.accepted_answer ? 'unaccept' : 'accept'), { id: post.id }))}><CheckCircle size={15} /></button>}
                {!topic.closed && <button className="button text small" onClick={() => compose('reply')}><Reply size={15} />回复</button>}
              </footer>}
            </div>}
    </div>
    {showChildren && <div className="nested-children">
      {children.map((child, index) => <NestedPost key={child.post.id} node={child} topic={topic} depth={depth + 1} maxDepth={maxDepth} isLastChild={index === children.length - 1 && !hasMore} expansion={expansion} onToggleExpansion={onToggleExpansion} sort={sort} onCompose={onCompose} highlightPostNumber={highlightPostNumber} highlightRef={highlightRef} />)}
      {hasMore && <button className="nested-load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <LoaderCircle className="spin" size={14} /> : <PlusCircle size={14} />}加载更多回复</button>}
    </div>}
    {showContinue && <div className="nested-children"><button className="nested-load-more" type="button" onClick={() => setThreadOpen(true)}><CornerDownRight size={14} />继续此主题</button></div>}
    {!deleted && <NestedThreadDialogMount open={threadOpen} onClose={() => setThreadOpen(false)} node={node} topic={topic} sort={sort} maxDepth={maxDepth} onCompose={onCompose} />}
    {deleteOpen && <Dialog title="删除这条帖子？" onClose={() => setDeleteOpen(false)}><div className="dialog-body"><p>将删除第 {post.post_number} 楼的这条回复。</p><div className="dialog-actions"><button className="button secondary" onClick={() => setDeleteOpen(false)}>取消</button><button className="button danger" disabled={mutation.isPending} onClick={() => { if (!user) return requestLogin(); mutation.mutate(() => api.delete('/posts/' + post.id + '.json'), { onSuccess: () => setDeleteOpen(false) }); }}>删除帖子</button></div></div></Dialog>}
  </article>;
}

// 单独挂载弹框，避免未打开时参与递归渲染
function NestedThreadDialogMount({ open, onClose, node, topic, sort, maxDepth, onCompose }) {
  if (!open) return null;
  return <NestedThreadDialog node={node} topic={topic} sort={sort} maxDepth={maxDepth} onCompose={onCompose} onClose={onClose} />;
}
