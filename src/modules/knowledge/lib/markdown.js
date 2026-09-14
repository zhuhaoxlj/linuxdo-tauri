import { Marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';

function inlineText(tokens) {
  return tokens.map(token => {
    if (token.tokens) return inlineText(token.tokens);
    if (token.type === 'html') return '';
    return token.text || token.raw || '';
  }).join('');
}

export function headingSlug(text) {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
}

export function parseNoteMarkdown(content = '') {
  const headings = [];
  const usedIds = new Set();
  const renderer = new Renderer();
  renderer.html = () => '';
  renderer.heading = function({ tokens, depth }) {
    const text = inlineText(tokens);
    const slug = `kb-${headingSlug(text)}`;
    let id = slug;
    let suffix = 1;
    while (usedIds.has(id)) id = `${slug}-${suffix++}`;
    usedIds.add(id);
    headings.push({ id, text, level: depth });
    return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  const parser = new Marked({ renderer, gfm: true, breaks: false });
  return { html: parser.parse(content || ''), headings };
}

export function renderNoteMarkdown(content) {
  const parsed = parseNoteMarkdown(content);
  const clean = DOMPurify.sanitize(parsed.html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style', 'srcset'],
  });
  const document = new DOMParser().parseFromString(clean, 'text/html');
  for (const anchor of document.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) continue;
    if (!/^(https?:\/\/|mailto:)/i.test(href)) {
      anchor.removeAttribute('href');
      continue;
    }
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  }
  for (const image of document.querySelectorAll('img')) {
    const source = image.getAttribute('src') || '';
    if (!/^(https?:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(source)) image.removeAttribute('src');
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
  }
  for (const input of document.querySelectorAll('input')) {
    if (input.type !== 'checkbox') {
      input.remove();
      continue;
    }
    input.disabled = true;
    input.setAttribute('aria-label', input.parentElement.textContent.trim() || '待办事项');
  }
  for (const code of document.querySelectorAll('pre code')) {
    const language = [...code.classList].find(name => name.startsWith('language-'))?.slice(9);
    if (language && hljs.getLanguage(language)) {
      code.innerHTML = hljs.highlight(code.textContent, { language }).value;
      code.classList.add('hljs');
    }
  }
  const headings = [...document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')]
    .map(heading => ({ id: heading.id, text: heading.textContent, level: Number(heading.tagName.slice(1)) }));
  return { html: document.body.innerHTML, headings };
}
