import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, Heart, MessageSquare, Pin, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { number, relativeTime } from '../lib/format';
import { topicPath } from '../lib/api';
import { Avatar, CategoryBadge } from './Common';

export default function TopicRow({ topic, users = {}, categories = {} }) {
  const { settings } = useApp();
  const author = users[topic.posters?.[0]?.user_id] || topic.creator || topic;
  const category = categories[topic.category_id];
  return <article className={`topic-row ${topic.pinned ? 'pinned' : ''}`}>
    {settings.showAvatars && <Link to={author.username ? `/user/${encodeURIComponent(author.username)}` : topicPath(topic.id)} className="topic-avatar" tabIndex={-1} aria-hidden="true"><Avatar user={author} size={39} /></Link>}
    <div className="topic-content"><Link className="topic-title" to={topicPath(topic.id, topic.last_read_post_number ? topic.last_read_post_number + 1 : undefined)}>{topic.pinned && <Pin size={14} />}{topic.closed && <Lock size={14} />}{topic.title}{topic.unseen && <i className="unread-dot" aria-label="未读" />}</Link><div className="topic-meta"><CategoryBadge category={category} />{(topic.tags || []).slice(0, 3).map(tag => { const name = typeof tag === 'string' ? tag : tag?.name; return name ? <Link className="tag" key={tag?.id || name} to={`/tag/${encodeURIComponent(name)}`}>#{name}</Link> : null; })}{!category && author.username && <span>{author.username}</span>}<span className="topic-mobile-time">{relativeTime(topic.last_posted_at || topic.created_at)}</span></div>{topic.excerpt && !settings.compact && <p className="topic-excerpt">{new DOMParser().parseFromString(topic.excerpt, 'text/html').body.textContent}</p>}</div>
    <div className="topic-stat" title="回复"><MessageSquare size={15} /><span>{number(Math.max(0, (topic.posts_count || 1) - 1))}</span></div><div className="topic-stat secondary-stat" title="浏览"><Eye size={15} /><span>{number(topic.views)}</span></div><div className="topic-stat secondary-stat" title="喜欢"><Heart size={15} /><span>{number(topic.like_count)}</span></div><time className="topic-time" dateTime={topic.last_posted_at}>{relativeTime(topic.last_posted_at || topic.created_at)}</time>
  </article>;
}
