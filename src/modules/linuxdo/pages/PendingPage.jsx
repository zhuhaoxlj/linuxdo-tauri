import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText } from '../lib/api';
import { Empty, ErrorState, Loading, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';
import Dialog from '../components/Dialog';
import Cooked from '../components/Cooked';

export default function PendingPage() {
  const { user } = useAuth();
  const { notify } = useApp();
  const [removing, setRemoving] = useState(null);
  const query = useQuery({ queryKey: ['pending', user?.username], enabled: Boolean(user), queryFn: () => api.get('/posts/' + encodeURIComponent(user.username) + '/pending.json') });
  const mutation = useMutation({ mutationFn: id => api.delete('/review/' + id), onSuccess: () => { setRemoving(null); query.refetch(); notify('已撤回待审核内容'); }, onError: error => notify(errorText(error)) });
  return <><PageHeading title="待审核内容" description="内容通过审核后，才会出现在话题中。" back="/drafts" /><AuthRequired>{query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <>{(query.data?.pending_posts || []).map(post => <article className="panel pending-card" key={post.id}><h3>{post.topic_title || post.title || '待审核回复'}</h3>{post.cooked ? <Cooked html={post.cooked} /> : <p className="raw-preview">{post.raw}</p>}<button className="button danger subtle small" onClick={() => setRemoving(post)}>撤回提交</button></article>)}{!query.data?.pending_posts?.length && <Empty title="没有等待审核的内容" />}</>}</AuthRequired>
    {removing && <Dialog title="撤回待审核内容？" onClose={() => setRemoving(null)}><div className="dialog-body"><p>撤回后，社区将不再审核这条内容。</p><div className="dialog-actions"><button className="button secondary" onClick={() => setRemoving(null)}>取消</button><button className="button danger" disabled={mutation.isPending} onClick={() => mutation.mutate(removing.reviewable_id || removing.id)}>撤回提交</button></div></div></Dialog>}
  </>;
}
