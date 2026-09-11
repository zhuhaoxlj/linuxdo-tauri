import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';
import { avatarUrl } from '../lib/format';
import { errorText } from '../lib/api';

export function Avatar({ user, size = 36 }) {
  const [failed, setFailed] = React.useState(false);
  const src = avatarUrl(user?.avatar_template, size * 2);
  return src && !failed
    ? <img className="avatar" width={size} height={size} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span className="avatar avatar-fallback" style={{ width: size, height: size }} aria-hidden="true">{(user?.username || 'F').slice(0, 1).toUpperCase()}</span>;
}

export function Loading({ label = '正在加载…' }) {
  return <div className="state-view" role="status"><LoaderCircle className="spin" size={25} /><p>{label}</p></div>;
}

export function ErrorState({ error, retry }) {
  return <div className="state-view error-state" role="alert"><AlertCircle size={26} /><p>{errorText(error)}</p>{retry && <button className="button secondary" onClick={() => retry()}><RefreshCw size={16} />重试</button>}</div>;
}

export function Empty({ title = '这里还没有内容', description, children }) {
  return <div className="state-view"><Inbox size={32} /><h3>{title}</h3>{description && <p>{description}</p>}{children}</div>;
}

export function PageHeading({ eyebrow, title, description, actions, back }) {
  return <div className="page-heading"><div>{back && <Link to={back} className="back-link"><ArrowLeft size={15} />返回</Link>}{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="heading-actions">{actions}</div></div>;
}

export function LoadMore({ query }) {
  if (!query.hasNextPage) return null;
  return <div className="load-more"><button className="button secondary" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? <LoaderCircle className="spin" size={16} /> : null}{query.isFetchingNextPage ? '正在加载…' : '加载更多'}</button></div>;
}

export function CategoryBadge({ category }) {
  if (!category) return null;
  return <Link to={`/category/${category.id}`} className="category-badge"><i style={{ background: /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(category.color || '') ? `#${category.color}` : 'var(--accent)' }} />{category.name}</Link>;
}
