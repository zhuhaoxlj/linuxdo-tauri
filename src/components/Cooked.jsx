import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import hljs from 'highlight.js/lib/common';
import { internalPath } from '../lib/api';
import Dialog from './Dialog';

export default function Cooked({ html = '', className = '' }) {
  const navigate = useNavigate();
  const root = useRef(null);
  const [viewer, setViewer] = useState(null);
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
    // 拆掉 Discourse lightbox 包装：图片外提并记录原图地址（供查看器加载原图），
    // 丢弃「文件名 尺寸 大小」meta 行与包装元素，避免包装布局产生的空白
    for (const anchor of document.querySelectorAll('a.lightbox')) {
      const image = anchor.querySelector('img');
      const href = anchor.getAttribute('href');
      if (image && href) image.setAttribute('data-original', href);
      if (image) anchor.replaceWith(image);
    }
    for (const wrapper of document.querySelectorAll('.lightbox-wrapper')) {
      const image = wrapper.querySelector('img');
      if (image) wrapper.replaceWith(image); else wrapper.remove();
    }
    return document.body.innerHTML;
  }, [html]);
  useEffect(() => {
    const node = root.current;
    if (!node) return undefined;
    node.querySelectorAll('pre code').forEach(code => {
      try { hljs.highlightElement(code); } catch { /* Unknown languages remain readable as plain text. */ }
    });
    node.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.code-copy')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.dataset.copyCode = 'true';
      button.setAttribute('aria-label', '复制代码');
      button.title = '复制代码';
      button.textContent = '复制';
      pre.appendChild(button);
    });
    return () => node.querySelectorAll('.code-copy').forEach(button => button.remove());
  }, [safe]);
  // 图片加载失败时替换为可点占位，避免浏览器按原始宽高比留下大片空白框
  useEffect(() => {
    const node = root.current;
    if (!node) return undefined;
    const onError = event => {
      const image = event.target;
      if (image?.tagName !== 'IMG' || image.dataset.broken) return;
      image.dataset.broken = 'true';
      const link = document.createElement('a');
      link.className = 'image-broken';
      link.href = image.getAttribute('src') || image.src || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '图片加载失败 · 点击查看原图';
      image.replaceWith(link);
    };
    node.addEventListener('error', onError, true);
    return () => node.removeEventListener('error', onError, true);
  }, [safe]);
  const click = event => {
    const image = event.target.closest('img');
    if (image && event.target.closest('.cooked') === event.currentTarget) {
      event.preventDefault();
      const images = [...event.currentTarget.querySelectorAll('img')];
      setViewer({ images: images.map(item => ({ src: item.dataset.original || item.currentSrc || item.src, alt: '图片预览' })), index: images.indexOf(image) });
      return;
    }
    const anchor = event.target.closest('a');
    if (anchor && (event.ctrlKey || event.metaKey || event.shiftKey)) return;
    if (anchor) {
      const route = internalPath(anchor.href);
      if (route) { event.preventDefault(); navigate(route); }
      else { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
    }
    const copyButton = event.target.closest('[data-copy-code]');
    if (copyButton) {
      const code = copyButton.parentElement.querySelector('code')?.innerText || '';
      navigator.clipboard.writeText(code).then(() => {
        copyButton.textContent = '已复制';
        window.setTimeout(() => { copyButton.textContent = '复制'; }, 1600);
      }).catch(() => { copyButton.textContent = '复制失败'; });
    }
  };
  const currentImage = viewer?.images[viewer.index];
  return <>
    <div ref={root} className={`cooked ${className}`} onClick={click} dangerouslySetInnerHTML={{ __html: safe }} />
    {currentImage && <Dialog title={currentImage.alt} wide onClose={() => setViewer(null)}><div className="image-viewer"><img src={currentImage.src} alt={currentImage.alt} /><div className="image-viewer-actions"><button className="icon-button" type="button" aria-label="上一张图片" title="上一张" disabled={viewer.images.length < 2} onClick={() => setViewer(current => ({ ...current, index: (current.index - 1 + current.images.length) % current.images.length }))}><ChevronLeft size={20} /></button><span>{viewer.index + 1} / {viewer.images.length}</span><button className="icon-button" type="button" aria-label="下一张图片" title="下一张" disabled={viewer.images.length < 2} onClick={() => setViewer(current => ({ ...current, index: (current.index + 1) % current.images.length }))}><ChevronRight size={20} /></button><a className="button secondary small" href={currentImage.src} download><Download size={15} />保存图片</a></div></div></Dialog>}
  </>;
}
