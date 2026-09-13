import React from 'react';
import { useNavigate } from '../lib/router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Circle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText, internalPath, topicPath } from '../lib/api';
import { relativeTime } from '../lib/format';
import { Empty, ErrorState, Loading, LoadMore, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';

const types = { 1: '提到了你', 2: '回复了你', 3: '引用了你', 4: '编辑了帖子', 5: '喜欢了你的帖子', 6: '发来了私信', 7: '邀请你加入私信', 9: '发布了回复', 11: '链接了你的帖子', 12: '获得徽章', 13: '邀请你加入话题', 15: '提到了你所在的群组', 17: '发布了话题', 19: '喜欢了你的帖子', 20: '帖子通过审核', 24: '书签提醒', 25: '回应了你的帖子', 29: '在聊天中提到了你', 30: '发来了聊天消息', 31: '邀请你加入聊天', 800: '关注了你', 801: '发布了新话题', 802: '回复了话题' };
function dataOf(notification) {
  if (typeof notification.data !== 'string') return notification.data || {};
  try { return JSON.parse(notification.data); } catch { return {}; }
}
export default function NotificationsPage() {
  const { user } = useAuth();
  const { notify } = useApp();
  const queries = useQueryClient();
  const navigate = useNavigate();
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list', user?.username], enabled: Boolean(user), initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get('/notifications', { limit: 30, offset: pageParam }),
    getNextPageParam: (last, pages) => last.notifications?.length === 30 ? pages.length * 30 : undefined,
  });
  const mark = useMutation({ mutationFn: id => api.put('/notifications/mark-read', id ? { id } : null), onSuccess: () => queries.invalidateQueries({ queryKey: ['notifications'] }), onError: error => notify(errorText(error)) });
  const items = [...new Map((query.data?.pages || []).flatMap(page => page.notifications || []).map(item => [item.id, item])).values()];
  const open = notification => {
    if (!notification.read) mark.mutate(notification.id);
    const data = dataOf(notification);
    if (notification.topic_id) navigate(topicPath(notification.topic_id, notification.post_number));
    else if (data.chat_channel_id) navigate('/chat/' + data.chat_channel_id);
    else if (data.badge_id) navigate('/badges/' + data.badge_id);
    else if (data.username) navigate('/user/' + encodeURIComponent(data.username));
    else if (internalPath(data.link)) navigate(internalPath(data.link));
  };
  return <><PageHeading eyebrow="INBOX" title="通知" description="每一次回应，都是对话的延续。" actions={user && <button className="button secondary" disabled={mark.isPending || !items.some(item => !item.read)} onClick={() => mark.mutate(null)}><CheckCheck size={16} />全部已读</button>} /><AuthRequired>{query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <><div className="notification-list panel">{items.map(item => {
    const data = dataOf(item);
    return <button className={'notification-row ' + (!item.read ? 'unread' : '')} key={item.id} onClick={() => open(item)}><span className="notification-symbol"><Bell size={20} /></span><span className="notification-content"><span><strong>{data.display_username || data.username || '社区'}</strong> {types[item.notification_type] || '有新的动态'}</span><span className="notification-title">{data.topic_title || data.title || data.badge_name || ''}</span><time>{relativeTime(item.created_at)}</time></span>{!item.read && <Circle size={8} fill="currentColor" className="unread-marker" />}</button>;
  })}</div>{!items.length && <Empty title="现在很安静" description="有新回复和提醒时，会出现在这里。" />}<LoadMore query={query} /></>}</AuthRequired></>;
}
