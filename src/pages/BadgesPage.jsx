import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { number } from '../lib/format';
import { Avatar, Empty, ErrorState, Loading, PageHeading } from '../components/Common';
import Cooked from '../components/Cooked';

export default function BadgesPage() {
  const { badgeId } = useParams();
  const query = useQuery({ queryKey: ['badges', badgeId || 'all'], queryFn: () => api.get(badgeId ? '/badges/' + badgeId + '.json' : '/badges.json') });
  const winners = useQuery({ queryKey: ['badges', badgeId, 'users'], enabled: Boolean(badgeId), queryFn: () => api.get('/user_badges.json', { badge_id: badgeId }) });
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} retry={query.refetch} />;
  const badge = query.data?.badge;
  if (badgeId) return <><PageHeading eyebrow="COMMUNITY BADGE" title={badge?.name || '社区徽章'} back="/badges" /><section className={'panel badge-detail badge-type-' + badge?.badge_type_id}><span className="badge-medal">✦</span><Cooked html={badge?.long_description || badge?.description || ''} /><p className="muted">{number(badge?.grant_count)} 次授予</p></section><h2 className="section-title">获得这枚徽章的成员</h2>{winners.isPending ? <Loading /> : winners.isError ? <ErrorState error={winners.error} retry={winners.refetch} /> : <div className="people-grid">{(winners.data?.users || []).map(user => <Link className="user-row panel" to={'/user/' + encodeURIComponent(user.username)} key={user.id}><Avatar user={user} size={42} /><span>{user.name || user.username}</span></Link>)}{!winners.data?.users?.length && <Empty title="暂无获得者" />}</div>}</>;
  const badges = (query.data?.badges || []).filter(item => item.enabled !== false);
  return <><PageHeading eyebrow="ACHIEVEMENTS" title="社区徽章" description="每一次参与，都在积累自己的社区故事。" /><div className="badge-grid">{badges.map(item => <Link className={'badge-card panel badge-type-' + item.badge_type_id} to={'/badges/' + item.id} key={item.id}><span className="badge-medal">✦</span><h3>{item.name}</h3><Cooked html={item.description || ''} /><span className="muted">{number(item.grant_count)} 次授予</span></Link>)}</div>{!badges.length && <Empty title="暂无可展示的徽章" />}</>;
}
