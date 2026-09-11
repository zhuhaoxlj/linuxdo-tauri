import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Bookmark, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, internalPath, topicPath } from '../lib/api';
import { relativeTime } from '../lib/format';
import { Empty, ErrorState, Loading, LoadMore, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';
import BookmarkDialog from '../components/BookmarkDialog';
import Cooked from '../components/Cooked';

export default function BookmarksPage() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(null);
  const query = useInfiniteQuery({
    queryKey: ['bookmarks', user?.username], enabled: Boolean(user), initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get('/u/' + encodeURIComponent(user.username) + '/bookmarks.json', { page: pageParam, limit: 20 }),
    getNextPageParam: (last, pages) => last.user_bookmark_list?.more_bookmarks_url && last.user_bookmark_list?.bookmarks?.length ? pages.length : undefined,
  });
  const entries = [...new Map((query.data?.pages || []).flatMap(page => page.user_bookmark_list?.bookmarks || []).map(entry => [entry.id, entry])).values()];
  return <><PageHeading eyebrow="COLLECTION" title="我的书签" description="把值得反复阅读的内容，好好留在这里。" /><AuthRequired>{query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : <><div className="saved-list">{entries.map(entry => {
    const route = entry.topic_id ? topicPath(entry.topic_id, entry.linked_post_number) : internalPath(entry.bookmarkable_url || '');
    return <article className="saved-card panel" key={entry.id}><Bookmark className="saved-icon" size={21} /><div>{route ? <Link className="result-title" to={route}>{entry.title || entry.fancy_title || '书签'}</Link> : <a className="result-title" href={entry.bookmarkable_url} target="_blank" rel="noreferrer">{entry.title || entry.fancy_title || '聊天书签'}</a>}{entry.name && <p>{entry.name}</p>}<Cooked html={entry.excerpt || ''} className="bookmark-excerpt" /><p className="muted">{relativeTime(entry.created_at)}{entry.reminder_at && ' · 提醒：' + new Date(entry.reminder_at).toLocaleString('zh-CN')}</p></div><button className="icon-button" aria-label="编辑书签" onClick={() => setEditing(entry)}><MoreHorizontal size={20} /></button></article>;
  })}</div>{!entries.length && <Empty title="还没有收藏的内容" description="阅读帖子时，点击书签图标即可保存。" />}<LoadMore query={query} /></>}</AuthRequired>{editing && <BookmarkDialog bookmark={editing} onClose={() => setEditing(null)} />}</>;
}
