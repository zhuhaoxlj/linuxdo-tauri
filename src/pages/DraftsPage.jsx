import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FilePenLine, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText } from '../lib/api';
import { draftKey, removeDraft, saveDraft } from '../lib/storage';
import { useLocalValue } from '../lib/useLocalValue';
import { relativeTime } from '../lib/format';
import { Empty, ErrorState, Loading, LoadMore, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';
import Dialog from '../components/Dialog';

function importDraft(entry) {
  const data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data || {};
  const topicId = entry.topic_id || Number(entry.draft_key?.match(/^topic_(\d+)/)?.[1]);
  const kind = topicId ? 'reply' : data.archetypeId === 'private_message' || data.action === 'privateMessage' ? 'message' : 'topic';
  return { kind, raw: data.reply || '', title: data.title || entry.title || '', categoryId: data.categoryId || '', tags: (data.tags || []).join(', '), recipients: (data.recipients || []).join(', '), replyTo: data.replyToPostNumber, topicId };
}

export default function DraftsPage() {
  const { user } = useAuth();
  const { notify } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('local');
  const [deleting, setDeleting] = useState(null);
  const drafts = Object.values(useLocalValue(draftKey(user?.username), {})).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const query = useInfiniteQuery({
    queryKey: ['drafts', 'server', user?.username], enabled: tab === 'server' && Boolean(user), initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get('/drafts.json', { offset: pageParam, limit: 20 }),
    getNextPageParam: (last, pages) => last.drafts?.length === 20 ? pages.length * 20 : undefined,
  });
  const resumeCloud = entry => {
    try {
      const id = 'cloud-copy:' + entry.draft_key + ':' + Date.now();
      saveDraft(user.username, id, importDraft(entry));
      navigate('/compose?draft=' + encodeURIComponent(id));
    } catch (error) { notify(errorText(error)); }
  };
  return <><PageHeading eyebrow="WORK IN PROGRESS" title="草稿箱" description="想法不用一次写完。留住它，等下一次灵感。" actions={<Link className="button secondary" to="/pending">待审核内容</Link>} /><div className="tabs section-tabs"><button className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}>此设备</button><button className={tab === 'server' ? 'active' : ''} onClick={() => setTab('server')}>论坛草稿</button></div><AuthRequired>{tab === 'local' ? <><div className="draft-grid">{drafts.map(draft => <article className="draft-card panel" key={draft.id}><div className="draft-card-top"><FilePenLine size={21} /><button className="icon-button" aria-label="删除草稿" onClick={() => setDeleting(draft)}><Trash2 size={17} /></button></div><Link className="result-title" to={'/compose?draft=' + encodeURIComponent(draft.id)}>{draft.title || ({ reply: '回复话题 #' + draft.topicId, edit: '编辑帖子', message: '未命名私信' }[draft.kind]) || '未命名话题'}</Link><p className="draft-excerpt">{draft.raw}</p><span className="muted">{relativeTime(draft.updatedAt)}</span></article>)}</div>{!drafts.length && <Empty title="还没有未完成的想法" description="编辑话题或回复时，会自动保存草稿。" />}</> : query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <><p className="page-note">继续编辑会在此设备创建副本，保留原有论坛草稿。</p><div className="draft-grid">{(query.data?.pages || []).flatMap(page => page.drafts || []).map(entry => <article className="draft-card panel" key={entry.draft_key}><FilePenLine size={21} /><h3>{entry.title || '论坛草稿'}</h3><p className="muted">{relativeTime(entry.updated_at)}</p><button className="button secondary small" onClick={() => resumeCloud(entry)}>继续编辑</button></article>)}</div>{!query.data?.pages.some(page => page.drafts?.length) && <Empty title="没有论坛草稿" />}<LoadMore query={query} /></>}</AuthRequired>
    {deleting && <Dialog title="删除这个草稿？" onClose={() => setDeleting(null)}><div className="dialog-body"><p>“{deleting.title || '未命名草稿'}”的本机内容将被删除。</p><div className="dialog-actions"><button className="button secondary" onClick={() => setDeleting(null)}>取消</button><button className="button danger" onClick={() => { removeDraft(user.username, deleting.id); setDeleting(null); }}>删除草稿</button></div></div></Dialog>}
  </>;
}
