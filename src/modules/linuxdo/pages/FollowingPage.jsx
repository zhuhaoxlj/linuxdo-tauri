import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from '../lib/router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Avatar, Empty, ErrorState, Loading, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';

export default function FollowingPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const username = params.get('username') || user?.username;
  const tab = params.get('tab') === 'followers' ? 'followers' : 'following';
  const query = useQuery({ queryKey: ['following', username, tab], enabled: Boolean(username), queryFn: () => api.get('/u/' + encodeURIComponent(username) + '/follow/' + tab) });
  const rows = Array.isArray(query.data) ? query.data : [];
  const content = query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : rows.length ? <div className="people-grid">{rows.map(person => <Link className="user-row panel" to={'/user/' + encodeURIComponent(person.username)} key={person.id || person.username}><Avatar user={person} size={49} /><div><strong>{person.name || person.username}</strong><p>@{person.username}</p></div></Link>)}</div> : <Empty title={tab === 'followers' ? '还没有关注者' : '还没有关注的人'} description="在用户资料页关注感兴趣的社区成员。" />;
  return <><PageHeading eyebrow="PEOPLE" title={username && username !== user?.username ? '@' + username + ' 的关系' : '与有趣的人保持联系'} description="沿着共同的兴趣，遇见更多同路人。" /><div className="tabs section-tabs"><button className={tab === 'following' ? 'active' : ''} onClick={() => setParams({ ...(username ? { username } : {}), tab: 'following' })}>关注</button><button className={tab === 'followers' ? 'active' : ''} onClick={() => setParams({ ...(username ? { username } : {}), tab: 'followers' })}>关注者</button></div>{username ? content : <AuthRequired>{content}</AuthRequired>}</>;
}
