import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/AppContext';
import { api } from '../lib/api';
import { Empty, ErrorState, Loading, LoadMore, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';
import TopicRow from '../components/TopicRow';

export default function MessagesPage() {
  const { user } = useAuth();
  const site = useSite();
  const [params, setParams] = useSearchParams();
  const tab = ['sent', 'archive'].includes(params.get('folder')) ? params.get('folder') : 'inbox';
  const query = useInfiniteQuery({
    queryKey: ['messages', user?.username, tab], enabled: Boolean(user), initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get('/topics/private-messages' + (tab === 'inbox' ? '' : '-' + tab) + '/' + encodeURIComponent(user.username) + '.json', { page: pageParam }),
    getNextPageParam: (last, pages) => last.topic_list?.more_topics_url && last.topic_list?.topics?.length ? pages.length : undefined,
  });
  const users = Object.fromEntries((query.data?.pages || []).flatMap(page => page.users || []).map(item => [item.id, item]));
  const topics = (query.data?.pages || []).flatMap(page => page.topic_list?.topics || []);
  const categories = Object.fromEntries((site.data?.categories || []).map(category => [category.id, category]));
  return <><PageHeading eyebrow="DIRECT MESSAGES" title="私信" description="一些对话，留给彼此。" actions={<Link className="button primary" to="/compose?type=message"><PenLine size={16} />写私信</Link>} /><div className="tabs section-tabs">{[['inbox', '收件箱'], ['sent', '已发送'], ['archive', '归档']].map(([value, label]) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => setParams({ folder: value })}>{label}</button>)}</div><AuthRequired>{query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <><div className="topic-list">{topics.map(topic => <TopicRow key={topic.id} topic={topic} users={users} categories={categories} />)}</div>{!topics.length && <Empty title="没有私信" />}<LoadMore query={query} /></>}</AuthRequired></>;
}
