import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Link } from '../lib/router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, ExternalLink, MapPin, MessageCircle, UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText, topicPath } from '../lib/api';
import { absoluteUrl, number, relativeTime } from '../lib/format';
import { Avatar, Empty, ErrorState, Loading, LoadMore } from '../components/Common';
import Cooked from '../components/Cooked';

export default function UserPage() {
  const { username } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'summary';
  const { user: currentUser, requestLogin } = useAuth();
  const { notify } = useApp();
  const queries = useQueryClient();
  const query = useQuery({ queryKey: ['user', username], queryFn: () => api.get('/u/' + encodeURIComponent(username) + '.json') });
  const summary = useQuery({ queryKey: ['user', username, 'summary'], enabled: tab === 'summary', queryFn: () => api.get('/u/' + encodeURIComponent(username) + '/summary.json') });
  const activity = useInfiniteQuery({
    queryKey: ['user', username, 'activity', tab], enabled: ['posts', 'likes'].includes(tab), initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get('/user_actions.json', { username, filter: tab === 'likes' ? '1' : '4,5', offset: pageParam }),
    getNextPageParam: (last, pages) => last.user_actions?.length >= 30 ? pages.reduce((total, page) => total + (page.user_actions?.length || 0), 0) : undefined,
  });
  const badges = useQuery({ queryKey: ['user', username, 'badges'], enabled: tab === 'badges', queryFn: () => api.get('/user-badges/' + encodeURIComponent(username) + '.json', { grouped: true }) });
  const profile = query.data?.user;
  const follow = useMutation({
    mutationFn: () => profile.is_followed ? api.delete('/follow/' + encodeURIComponent(username)) : api.put('/follow/' + encodeURIComponent(username)),
    onSuccess: () => { queries.invalidateQueries({ queryKey: ['user', username] }); queries.invalidateQueries({ queryKey: ['following'] }); },
    onError: error => notify(errorText(error)),
  });
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} retry={query.refetch} />;
  if (!profile) return <Empty title="用户不存在" />;
  const stats = summary.data?.user_summary || {};
  const summaryTopics = Object.fromEntries((summary.data?.topics || []).map(topic => [topic.id, topic]));
  return <><section className="profile panel"><div className="profile-cover" /><div className="profile-main"><Avatar user={profile} size={88} /><div className="profile-identity"><h1>{profile.name || profile.username}</h1><span>@{profile.username}</span>{profile.title && <span className="profile-title">{profile.title}</span>}</div><div className="profile-actions">{currentUser?.username !== username ? <>{profile.can_follow !== false && <button className="button secondary" disabled={follow.isPending} onClick={() => currentUser ? follow.mutate() : requestLogin()}>{profile.is_followed ? <UserCheck size={17} /> : <UserPlus size={17} />}{profile.is_followed ? '已关注' : '关注'}</button>}{profile.can_send_private_message_to_user !== false && <Link className="button primary" to={'/compose?type=message&to=' + encodeURIComponent(username)}><MessageCircle size={17} />私信</Link>}</> : <Link className="button secondary" to="/settings?tab=account">编辑资料</Link>}</div></div>
    <div className="profile-description"><Cooked html={profile.bio_cooked || profile.bio_excerpt || ''} /><div className="profile-details">{profile.location && <span><MapPin size={14} />{profile.location}</span>}{profile.website && absoluteUrl(profile.website) && <a href={absoluteUrl(profile.website)} target="_blank" rel="noreferrer"><ExternalLink size={14} />个人网站</a>}<span><Calendar size={14} />{profile.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') + ' 加入' : ''}</span><span>信任等级 {profile.trust_level ?? 0}</span><Link to={'/following?username=' + encodeURIComponent(username)}>关注 {number(profile.total_following)}</Link><Link to={'/following?username=' + encodeURIComponent(username) + '&tab=followers'}>关注者 {number(profile.total_followers)}</Link></div></div>
  </section><div className="tabs section-tabs">{[['summary', '概览'], ['posts', '话题与回复'], ['likes', '送出的喜欢'], ['badges', '徽章']].map(([value, label]) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => setParams({ tab: value })}>{label}</button>)}</div>
    {tab === 'summary' ? summary.isPending ? <Loading /> : summary.isError ? <ErrorState error={summary.error} retry={summary.refetch} /> : <><div className="profile-stats">{[['获赞', stats.likes_received], ['送出喜欢', stats.likes_given], ['话题', stats.topic_count], ['回复', stats.post_count], ['阅读帖子', stats.posts_read_count], ['访问天数', stats.days_visited]].map(([label, value]) => <div className="panel" key={label}><strong>{number(value)}</strong><span>{label}</span></div>)}</div><section className="panel profile-topics"><h2>热门话题</h2>{(stats.topics || []).map(item => { const topic = summaryTopics[item.id] || item; return <Link className="history-row" to={topicPath(topic.id)} key={topic.id}><strong>{topic.title || '话题 #' + topic.id}</strong><span className="muted">{number(topic.like_count)} 喜欢</span></Link>; })}{!stats.topics?.length && <p className="muted">还没有热门话题</p>}</section></>
      : tab === 'badges' ? badges.isPending ? <Loading /> : badges.isError ? <ErrorState error={badges.error} retry={badges.refetch} /> : <div className="badge-grid">{(badges.data?.badges || []).map(badge => <Link className={'badge-card panel badge-type-' + badge.badge_type_id} to={'/badges/' + badge.id} key={badge.id}><span className="badge-medal">✦</span><h3>{badge.name}</h3><Cooked html={badge.description || ''} /></Link>)}{!badges.data?.badges?.length && <Empty title="还没有徽章" />}</div>
        : activity.isPending ? <Loading /> : activity.isError ? <ErrorState error={activity.error} retry={activity.refetch} /> : <><div className="activity-list">{(activity.data?.pages || []).flatMap(page => page.user_actions || []).map((item, index) => <article className="panel activity-card" key={item.post_id + ':' + index}><Link className="result-title" to={topicPath(item.topic_id, item.post_number)}>{item.title || '话题 #' + item.topic_id}</Link><Cooked html={item.excerpt || ''} /><span className="muted">{relativeTime(item.created_at)}</span></article>)}</div>{!activity.data?.pages.some(page => page.user_actions?.length) && <Empty title="没有相关动态" />}<LoadMore query={activity} /></>}
  </>;
}
