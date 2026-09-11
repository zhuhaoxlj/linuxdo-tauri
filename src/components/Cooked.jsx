import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { internalPath } from '../lib/api';

export default function Cooked({ html = '', className = '' }) {
  const navigate = useNavigate();
  const safe = useMemo(() => {
    const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ['video', 'audio', 'source'],
    ADD_ATTR: ['controls', 'poster', 'preload', 'playsinline', 'target'],
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
      FORBID_ATTR: ['style', 'srcset'],
    });
    const document = new DOMParser().parseFromString(clean, 'text/html');
    for (const node of document.querySelectorAll('[href], [src], [poster]')) {
      for (const attribute of ['href', 'src', 'poster']) {
        const value = node.getAttribute(attribute);
        if (value?.startsWith('/')) node.setAttribute(attribute, new URL(value, 'https://linux.do').href);
      }
      if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
      if (node.tagName === 'IMG') { node.setAttribute('loading', 'lazy'); node.setAttribute('decoding', 'async'); }
    }
    return document.body.innerHTML;
  }, [html]);
  const click = event => {
    const anchor = event.target.closest('a');
    if (!anchor || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const route = internalPath(anchor.href);
    if (route) { event.preventDefault(); navigate(route); }
    else if (anchor) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  };
  return <div className={`cooked ${className}`} onClick={click} dangerouslySetInnerHTML={{ __html: safe }} />;
}
