import React from 'react';
import { headingSlug } from '../lib/markdown';

export default function MarkdownContent({ document, className = '' }) {
  const handleLink = event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    event.preventDefault();
    let fragment = anchor.getAttribute('href').slice(1);
    try { fragment = decodeURIComponent(fragment); } catch {}
    const id = fragment.startsWith('kb-') ? fragment : `kb-${headingSlug(fragment)}`;
    event.currentTarget.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <div className={`knowledge-markdown ${className}`} onClick={handleLink} dangerouslySetInnerHTML={{ __html: document.html }} />;
}
