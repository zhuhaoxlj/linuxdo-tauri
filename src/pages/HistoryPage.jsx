import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/AppContext';
import { api, topicPath } from '../lib/api';
import { historyKey, writeLocal } from '../lib/storage';
import { useLocalValue } from '../lib/useLocalValue';
import { relativeTime } from '../lib/format';
import { Empty, ErrorState, Loading, LoadMore, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';
import Dialog from '../components/Dialog';
import TopicRow from '../components/TopicRow';

export default function HistoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('local');
  const [clear, setClear] = useState(false);
  const history = useLocalValue(historyKey(user?.username), []);
  const site = useSite();
  const query = useInfiniteQuery({
    queryKey: ['history', 'server', user?.username], enabled: tab === 'server' && Boolean(user), initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get('/read.json', { page: pageParam }),
    getNextPageParam: (last, pages) => last.topic_list?.more_topics_url && last.topic_list?.topics?.length ? pages.length : undefined,
  });
  const categories = Object.fromEntries((site.data?.categories || []).map(category => [category.id, category]));
  const users = Object.fromEntries((query.data?.pages || []).flatMap(page => page.users || []).map(item => [item.id, item]));
  return <><PageHeading eyebrow="RECENTLY READ" title="阅读历史" description="从上一次停下的地方，继续探索。" actions={tab === 'local' && history.length > 0 && <button className="button secondary" onClick={() => setClear(true)}><Trash2 size={16} />清空本机历史</button>} /><div className="tabs section-tabs"><button className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}>此设备</button><button className={tab === 'server' ? 'active' : ''} onClick={() => setTab('server')}>论坛历史</button></div>
    {tab === 'local' ? history.length ? <div className="panel history-list">{history.map(entry => <Link to={topicPath(entry.id, entry.postNumber)} key={entry.id} className="history-row"><div><strong>{entry.title}</strong><p className="muted">读到 #{entry.postNumber} · {relativeTime(entry.visitedAt)}</p></div><ArrowUpRight size={18} /></Link>)}</div> : <Empty title="阅读，从一个话题开始" description="阅读记录会保留在此设备，最多 500 条。" /> : <AuthRequired>{query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <>{(query.data?.pages || []).flatMap(page => page.topic_list?.topics || []).map(topic => <TopicRow key={topic.id} topic={topic} users={users} categories={categories} />)}{!query.data?.pages.some(page => page.topic_list?.topics?.length) && <Empty title="没有论坛阅读记录" />}<LoadMore query={query} /></>}</AuthRequired>}
    {clear && <Dialog title="清空本机阅读历史？" onClose={() => setClear(false)}><div className="dialog-body"><p>仅删除此设备的阅读记录，论坛历史不受影响。</p><div className="dialog-actions"><button className="button secondary" onClick={() => setClear(false)}>取消</button><button className="button danger" onClick={() => { writeLocal(historyKey(user?.username), []); setClear(false); }}>清空记录</button></div></div></Dialog>}
  </>;
}
