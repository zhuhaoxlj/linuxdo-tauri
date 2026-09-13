import React, { useState } from 'react';
import { Link } from '../lib/router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, CheckCircle, Heart, Link as LinkIcon, Pencil, Quote, Reply, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText, topicPath } from '../lib/api';
import { number, relativeTime } from '../lib/format';
import { Avatar } from './Common';
import BookmarkDialog from './BookmarkDialog';
import Cooked from './Cooked';
import Dialog from './Dialog';
import PostPoll from './PostPoll';

export default function Post({ post, topic, onCompose, onChanged }) {
  const { user, requestLogin } = useAuth();
  const { notify } = useApp();
  const queries = useQueryClient();
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const like = post.actions_summary?.find(action => action.id === 2);
  const bookmark = topic.bookmarks?.find(item => item.bookmarkable_id === post.id && item.bookmarkable_type === 'Post') || (post.bookmark_id ? { id: post.bookmark_id } : null);
  const mutation = useMutation({
    mutationFn: operation => operation(),
    onSuccess: async () => {
      await queries.invalidateQueries({ queryKey: ['topic', String(topic.id)] });
      onChanged?.();
      setDeleteOpen(false);
    },
    onError: error => notify(errorText(error)),
  });
  const act = operation => user ? mutation.mutate(operation) : requestLogin();
  const compose = async (kind, quote = false) => {
    if (!user) return requestLogin();
    setPreparing(true);
    try {
      let raw = '';
      if (kind === 'edit' || quote) {
        const selected = quote ? window.getSelection()?.toString() : '';
        raw = selected || (await api.get('/posts/' + post.id + '.json')).raw || '';
      }
      if (quote) raw = '[quote="' + post.username + ', post:' + post.post_number + ', topic:' + topic.id + '"]\n' + raw + '\n[/quote]\n\n';
      onCompose({ kind, topicId: topic.id, postId: post.id, replyTo: post.post_number, raw });
    } catch (error) { notify(errorText(error)); }
    finally { setPreparing(false); }
  };
  return <article className={'forum-post panel ' + (post.accepted_answer ? 'accepted-post' : '')} id={'post-' + post.post_number} data-post-number={post.post_number}>
    <header className="post-header"><Link to={'/user/' + encodeURIComponent(post.username)}><Avatar user={post} size={42} /></Link><div className="post-author"><Link to={'/user/' + encodeURIComponent(post.username)}>{post.name || post.username}</Link><span>@{post.username}{post.user_title && ' · ' + post.user_title}</span></div><Link to={topicPath(topic.id, post.post_number)} className="post-number">#{post.post_number}</Link><time title={new Date(post.created_at).toLocaleString('zh-CN')}>{relativeTime(post.created_at)}</time></header>
    {post.reply_to_post_number && <Link className="reply-reference" to={topicPath(topic.id, post.reply_to_post_number)}><Reply size={14} />回复 #{post.reply_to_post_number}</Link>}
    {post.accepted_answer && <p className="accepted-label"><CheckCircle size={16} />已采纳的解答</p>}
    {post.deleted_at ? <p className="muted">此帖子已删除</p> : <><Cooked html={post.cooked || ''} />{(post.polls || []).map(poll => <PostPoll key={poll.name} poll={poll} post={post} />)}</>}
    <footer className="post-actions">
      <button className={'button text small like-button ' + (like?.acted ? 'is-liked' : '')} aria-label={like?.acted ? '取消点赞' : '点赞'} aria-pressed={Boolean(like?.acted)} disabled={mutation.isPending || (user && !like?.acted && (like?.can_act === false || user.username === post.username))} onClick={() => act(() => like?.acted ? api.delete('/post_actions/' + post.id, { post_action_type_id: 2 }) : api.post('/post_actions', { id: post.id, post_action_type_id: 2 }))}><Heart size={17} fill={like?.acted ? 'currentColor' : 'none'} />{number(like?.count)}</button>
      <div className="post-action-right">
        <button className={'icon-button ' + (bookmark ? 'selected' : '')} aria-label={bookmark ? '编辑书签' : '添加书签'} title={bookmark ? '编辑书签' : '添加书签'} onClick={() => user ? setBookmarkOpen(true) : requestLogin()}><Bookmark size={17} fill={bookmark ? 'currentColor' : 'none'} /></button>
        <button className="icon-button" aria-label="复制帖子链接" title="复制链接" onClick={() => navigator.clipboard.writeText('https://linux.do/t/' + topic.id + '/' + post.post_number).then(() => notify('链接已复制')).catch(() => notify('复制失败，请使用话题的浏览器入口'))}><LinkIcon size={17} /></button>
        {!topic.closed && <button className="icon-button" disabled={preparing} aria-label="引用回复" title="引用回复" onClick={() => compose('reply', true)}><Quote size={17} /></button>}
        {post.can_edit && <button className="icon-button" disabled={preparing} aria-label="编辑帖子" title="编辑帖子" onClick={() => compose('edit')}><Pencil size={17} /></button>}
        {post.can_delete && <button className="icon-button" disabled={mutation.isPending} aria-label="删除帖子" title="删除帖子" onClick={() => setDeleteOpen(true)}><Trash2 size={17} /></button>}
        {(post.can_accept_answer || post.can_unaccept_answer) && <button className="icon-button" aria-label={post.accepted_answer ? '取消采纳' : '采纳回答'} disabled={mutation.isPending} onClick={() => act(() => api.post('/solution/' + (post.accepted_answer ? 'unaccept' : 'accept'), { id: post.id }))}><CheckCircle size={17} /></button>}
        {!topic.closed && topic.details?.can_create_post !== false && <button className="button text small" disabled={preparing} onClick={() => compose('reply')}><Reply size={17} />回复</button>}
      </div>
    </footer>
    {bookmarkOpen && <BookmarkDialog postId={post.id} bookmark={bookmark} onClose={() => setBookmarkOpen(false)} onSaved={onChanged} />}
    {deleteOpen && <Dialog title="删除这条帖子？" onClose={() => setDeleteOpen(false)}><div className="dialog-body"><p>将删除你在本话题中的第 {post.post_number} 楼。</p><div className="dialog-actions"><button className="button secondary" onClick={() => setDeleteOpen(false)}>取消</button><button className="button danger" disabled={mutation.isPending} onClick={() => act(() => api.delete('/posts/' + post.id + '.json'))}>删除帖子</button></div></div></Dialog>}
  </article>;
}
