import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Link, NavLink, useNavigate } from '../lib/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Hash, Heart, MessageCircle, Paperclip, Pencil, Plus, RefreshCw, Reply, Send, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText, uploadFile } from '../lib/api';
import { absoluteUrl, relativeTime } from '../lib/format';
import { readLocal, writeLocal } from '../lib/storage';
import { Avatar, Empty, ErrorState, Loading, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';
import Cooked from '../components/Cooked';
import Dialog from '../components/Dialog';

export default function ChatPage() {
  const { channelId } = useParams();
  const [chatParams] = useSearchParams();
  const { user } = useAuth();
  const { notify } = useApp();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [groupName, setGroupName] = useState('');
  const [browse, setBrowse] = useState(false);
  const channels = useQuery({ queryKey: ['chat', 'channels'], enabled: Boolean(user), queryFn: () => api.get('/chat/api/me/channels'), refetchInterval: 60_000 });
  const publicChannels = useQuery({ queryKey: ['chat', 'public'], enabled: browse && Boolean(user), queryFn: () => api.get('/chat/api/channels', { limit: 50, status: 'open' }) });
  const create = useMutation({
    mutationFn: () => api.post('/chat/api/direct-message-channels', { target_usernames: recipients.split(/[,，\s]+/).filter(Boolean), ...(groupName.trim() ? { name: groupName.trim() } : {}), upsert: !groupName.trim() }),
    onSuccess: data => { queries.invalidateQueries({ queryKey: ['chat', 'channels'] }); setCreating(false); const channel = data.channel || data; navigate('/chat/' + channel.id); },
    onError: error => notify(errorText(error)),
  });
  const join = useMutation({ mutationFn: id => api.post('/chat/api/channels/' + id + '/memberships/me'), onSuccess: (_, id) => { channels.refetch(); setBrowse(false); navigate('/chat/' + id); }, onError: error => notify(errorText(error)) });
  const groups = [['公共频道', channels.data?.public_channels || []], ['私聊与群聊', channels.data?.direct_message_channels || []]];
  return <><PageHeading eyebrow="LIVE CONVERSATIONS" title="聊天" description="让交流更即时一点。" actions={user && <button className="button primary" onClick={() => setCreating(true)}><Plus size={17} />新建聊天</button>} /><AuthRequired>{channels.isPending ? <Loading /> : channels.isError ? <ErrorState error={channels.error} retry={channels.refetch} /> : <div className="chat-layout panel"><aside className="chat-sidebar"><button className="button secondary small" onClick={() => setBrowse(true)}><Hash size={16} />发现公共频道</button>{groups.map(([label, items]) => <div className="chat-channel-group" key={label}><h3>{label}</h3>{items.map(channel => <NavLink to={'/chat/' + channel.id} className={({ isActive }) => 'chat-channel ' + (isActive ? 'active' : '')} key={channel.id}>{channel.chatable_type === 'Category' ? <Hash size={17} /> : <MessageCircle size={17} />}<span>{channel.unicode_title || channel.title || '聊天 #' + channel.id}</span>{channel.last_message?.id > (channel.current_user_membership?.last_read_message_id || 0) && <i className="unread-dot" />}</NavLink>)}{!items.length && <p className="muted">暂无{label}</p>}</div>)}</aside><section className="chat-main">{channelId ? <ChatConversation key={channelId + ":" + (chatParams.get("thread") || "main")} channelId={channelId} /> : <Empty title="选择一个聊天，继续对话" description="也可以创建私聊，或加入一个公共频道。" />}</section></div>}</AuthRequired>
    {creating && <Dialog title="开始新的聊天" onClose={() => setCreating(false)}><form className="dialog-body" onSubmit={event => { event.preventDefault(); create.mutate(); }}><label className="field"><span>参与者用户名</span><input aria-label="聊天参与者" placeholder="多位用户用逗号分隔" value={recipients} onChange={event => setRecipients(event.target.value)} required /></label><label className="field"><span>群聊名称 <small>可选</small></span><input value={groupName} onChange={event => setGroupName(event.target.value)} /></label>{create.error && <p className="inline-error">{errorText(create.error)}</p>}<div className="dialog-actions"><button className="button primary" type="submit" disabled={create.isPending}>创建聊天</button></div></form></Dialog>}
    {browse && <Dialog title="发现公共频道" onClose={() => setBrowse(false)}><div className="dialog-body">{publicChannels.isPending ? <Loading /> : publicChannels.isError ? <ErrorState error={publicChannels.error} retry={publicChannels.refetch} /> : <>{(publicChannels.data?.channels || []).map(channel => <article className="channel-discovery" key={channel.id}><div><h3>{channel.title}</h3><p className="muted">{channel.description}</p></div><button className="button secondary small" disabled={join.isPending} onClick={() => join.mutate(channel.id)}>加入</button></article>)}{!publicChannels.data?.channels?.length && <Empty title="暂无可加入的频道" />}</>}</div></Dialog>}
  </>;
}

function ChatConversation({ channelId }) {
  const { user } = useAuth();
  const { notify } = useApp();
  const queries = useQueryClient();
  const [params, setParams] = useSearchParams();
  const thread = params.get('thread');
  const draftKey = 'chat-draft:' + user.username + ':' + channelId + ':' + (thread || 'main');
  const [raw, setRaw] = useState(() => readLocal(draftKey, ''));
  const [uploads, setUploads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [replying, setReplying] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [older, setOlder] = useState([]);
  const [hasPast, setHasPast] = useState(null);
  const files = useRef(null);
  const scroll = useRef(null);
  const atBottom = useRef(true);
  const detail = useQuery({ queryKey: ['chat', channelId, 'detail'], queryFn: () => api.get('/chat/api/channels/' + channelId) });
  const path = '/chat/api/channels/' + channelId + (thread ? '/threads/' + thread : '') + '/messages';
  const messages = useQuery({ queryKey: ['chat', channelId, 'messages', thread], queryFn: () => api.get(path, { page_size: 50 }), refetchInterval: 15_000, refetchIntervalInBackground: false });
  const channel = detail.data?.channel || detail.data;
  const posts = [...new Map([...older, ...(messages.data?.messages || [])].map(message => [message.id, message])).values()].sort((a, b) => a.id - b.id);
  const lastId = posts.at(-1)?.id;
  const refresh = () => queries.invalidateQueries({ queryKey: ['chat', channelId] });
  useEffect(() => { try { if (!editing) writeLocal(draftKey, raw); } catch { notify('聊天草稿无法保存，请复制内容后再离开'); } }, [raw, draftKey, editing]);
  useEffect(() => { setOlder([]); setHasPast(null); setReplying(null); setEditing(null); setUploads([]); setRaw(readLocal(draftKey, '')); atBottom.current = true; }, [thread]);
  useEffect(() => {
    if (!atBottom.current) return;
    requestAnimationFrame(() => scroll.current?.scrollTo({ top: scroll.current.scrollHeight }));
  }, [lastId, thread]);
  const markRead = () => {
    if (lastId && document.visibilityState === 'visible' && document.hasFocus() && atBottom.current) {
      api.put('/chat/api/channels/' + channelId + (thread ? '/threads/' + thread : '') + '/read?message_id=' + lastId).then(() => queries.invalidateQueries({ queryKey: ['chat', 'channels'] })).catch(() => {});
    }
  };
  useEffect(() => { const timer = setTimeout(markRead, 1500); return () => clearTimeout(timer); }, [lastId, thread]);
  const loadOlder = useMutation({
    mutationFn: () => api.get(path, { direction: 'past', target_message_id: posts[0]?.id, page_size: 50 }),
    onSuccess: data => {
      const previousHeight = scroll.current?.scrollHeight || 0;
      setOlder(current => [...(data.messages || []), ...current]);
      setHasPast(Boolean(data.meta?.can_load_more_past));
      requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop += scroll.current.scrollHeight - previousHeight; });
    },
    onError: error => notify(errorText(error)),
  });
  const send = useMutation({
    mutationFn: () => editing
      ? api.put('/chat/api/channels/' + channelId + '/messages/' + editing.id, { message: raw, upload_ids: uploads.map(file => file.id) })
      : api.post('/chat/' + channelId, { message: raw, staged_id: crypto.randomUUID(), ...(replying ? { in_reply_to_id: replying.id } : {}), ...(thread ? { thread_id: Number(thread) } : {}), ...(uploads.length ? { upload_ids: uploads.map(file => file.id) } : {}) }),
    onSuccess: () => { setRaw(''); setEditing(null); setReplying(null); setUploads([]); writeLocal(draftKey, ''); atBottom.current = true; setOlder([]); refresh(); },
    onError: error => notify(errorText(error)),
  });
  const action = useMutation({ mutationFn: operation => operation(), onSuccess: () => { setDeleting(null); setOlder([]); refresh(); }, onError: error => notify(errorText(error)) });
  const attach = async selected => {
    setUploading(true);
    try { for (const file of selected) { const result = await uploadFile(file); if (!result.id) throw new Error('服务器未返回附件编号'); setUploads(current => [...current, result]); } }
    catch (error) { notify(errorText(error)); }
    finally { setUploading(false); if (files.current) files.current.value = ''; }
  };
  return <><header className="chat-heading"><div><h2>{channel?.unicode_title || channel?.title || '聊天'}</h2><span className="muted">{thread ? '消息串 #' + thread : channel?.description || '实时对话'}</span></div><div>{thread && <button className="button text small" onClick={() => setParams({})}>返回主会话</button>}<button className="icon-button" aria-label="刷新聊天" onClick={refresh}><RefreshCw size={17} /></button></div></header>
    <div className="chat-messages" ref={scroll} onScroll={() => { const node = scroll.current; atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70; }}>
      {(hasPast ?? messages.data?.meta?.can_load_more_past) && <button className="button text small chat-load-more" disabled={loadOlder.isPending} onClick={() => loadOlder.mutate()}><ArrowUp size={14} />更早的消息</button>}
      {messages.isPending ? <Loading /> : messages.isError ? <ErrorState error={messages.error} retry={messages.refetch} /> : posts.map(message => <article className={'chat-message ' + (message.user?.username === user.username ? 'own-message' : '')} key={message.id}><Link to={'/user/' + encodeURIComponent(message.user?.username || user.username)}><Avatar user={message.user} size={34} /></Link><div className="chat-message-content"><header><strong>{message.user?.username}</strong><time>{relativeTime(message.created_at)}{message.edited ? ' · 已编辑' : ''}</time></header>{message.in_reply_to && <p className="chat-reply-reference">回复 @{message.in_reply_to.user?.username}: {message.in_reply_to.excerpt}</p>}{message.deleted_at ? <p className="muted">消息已删除</p> : <><Cooked html={message.cooked || ''} />{!message.cooked && <p className="raw-preview">{message.message}</p>}<div className="chat-attachments">{(message.uploads || []).map(file => <a href={absoluteUrl(file.url)} target="_blank" rel="noreferrer" key={file.id}>{file.width ? <img src={absoluteUrl(file.url)} alt={file.original_filename || '图片附件'} loading="lazy" /> : <span><Paperclip size={14} />{file.original_filename || '附件'}</span>}</a>)}</div><div className="chat-message-actions"><button className="icon-button" aria-label="回复消息" title="回复消息" onClick={() => setReplying(message)}><Reply size={14} /></button><button className="icon-button" aria-label="喜欢这条消息" title="喜欢" disabled={action.isPending} onClick={() => action.mutate(() => api.put('/chat/' + channelId + '/react/' + message.id, { emoji: 'heart', react_action: message.reactions?.find(item => item.emoji === 'heart')?.reacted ? 'remove' : 'add' }))}><Heart size={14} />{message.reactions?.find(item => item.emoji === 'heart')?.count || ''}</button>{message.user?.id === user.id && <><button className="icon-button" aria-label="编辑消息" onClick={() => { setEditing(message); setRaw(message.message); setUploads(message.uploads || []); }}><Pencil size={14} /></button>{channel?.meta?.can_delete_self && <button className="icon-button" aria-label="删除消息" onClick={() => setDeleting(message)}><Trash2 size={14} /></button>}</>}{message.thread && <button className="button text small" onClick={() => setParams({ thread: String(message.thread.id) })}><MessageCircle size={14} />{message.thread.reply_count || 0} 条回复</button>}</div></>}</div></article>)}
      {messages.isSuccess && !posts.length && <Empty title="还没有消息" description="打个招呼，开启对话。" />}
    </div><form className="chat-composer" onSubmit={event => { event.preventDefault(); if ((raw.trim() || uploads.length) && !send.isPending && !uploading) send.mutate(); }}>
      {(replying || editing) && <div className="chat-compose-context"><span>{editing ? '编辑消息' : '回复 @' + replying.user?.username}</span><button type="button" className="icon-button" aria-label="取消回复或编辑" onClick={() => { setReplying(null); setEditing(null); if (editing) { setRaw(readLocal(draftKey, '')); setUploads([]); } }}><X size={15} /></button></div>}
      {uploads.length > 0 && <div className="upload-chips">{uploads.map(file => <span key={file.id}>{file.original_filename || '附件'}<button type="button" className="icon-button" aria-label="移除附件" onClick={() => setUploads(current => current.filter(item => item.id !== file.id))}><X size={12} /></button></span>)}</div>}
      <textarea aria-label="聊天消息" placeholder={channel?.status === 'closed' ? '此频道已关闭' : '输入消息… Ctrl + Enter 发送'} value={raw} onChange={event => setRaw(event.target.value)} disabled={send.isPending || channel?.status === 'closed'} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
      <div className="chat-composer-tools"><button className="icon-button" type="button" aria-label="上传聊天附件" disabled={uploading || send.isPending} onClick={() => files.current?.click()}><Paperclip size={18} /></button><input ref={files} type="file" className="sr-only" multiple tabIndex={-1} onChange={event => attach(Array.from(event.target.files))} /><span className="muted">{uploading ? '附件上传中…' : '支持 Markdown'}</span><button className="button primary small" type="submit" disabled={send.isPending || uploading || (!raw.trim() && !uploads.length) || channel?.status === 'closed'}><Send size={15} />{editing ? '保存修改' : '发送'}</button></div>
    </form>{deleting && <Dialog title="删除这条消息？" onClose={() => setDeleting(null)}><div className="dialog-body"><p className="raw-preview">{deleting.message}</p><div className="dialog-actions"><button className="button secondary" onClick={() => setDeleting(null)}>取消</button><button className="button danger" disabled={action.isPending} onClick={() => action.mutate(() => api.delete('/chat/api/channels/' + channelId + '/messages/' + deleting.id))}>删除消息</button></div></div></Dialog>}
  </>;
}
