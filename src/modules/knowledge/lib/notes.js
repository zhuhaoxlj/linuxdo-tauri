export const NOTE_TYPES = [
  { id: 'note', label: '笔记', description: '捕捉一个想法，记录一份新知', icon: '✍️' },
  { id: 'summary', label: '总结', description: '回顾实践，让经验变成方法', icon: '🌱' },
  { id: 'article', label: '文章', description: '整理阅读，留下自己的思考', icon: '📖' },
];

export const SUGGESTED_FOLDERS = ['随手记', '学习笔记', '工作实践', '阅读摘录', '生活记录'];

const TEMPLATES = {
  note: '',
  summary: '## 背景与目标\n\n这次做了什么？希望解决什么问题？\n\n## 过程与发现\n\n记录关键步骤、尝试和观察。\n\n## 经验与总结\n\n哪些方法值得保留？哪些地方可以改进？\n\n## 下一步行动\n\n- [ ] 写下一个可以立即执行的行动\n',
  article: '## 核心观点\n\n用自己的话，概括这篇文章最重要的观点。\n\n## 重要摘录\n\n> 记下值得反复阅读的句子。\n\n## 我的思考\n\n它与你已有的知识有什么联系？带来了哪些新的问题？\n\n## 参考资料\n\n补充原文链接或延伸阅读。\n',
};

export function createNoteDraft(type = 'note', folder = '随手记') {
  const selectedType = NOTE_TYPES.find(item => item.id === type) || NOTE_TYPES[0];
  return {
    title: '',
    content: TEMPLATES[selectedType.id],
    summary: '',
    folder,
    tags: [],
    type: selectedType.id,
    status: 'draft',
    sourceUrl: '',
    pinned: false,
  };
}

export function noteTitle(note) {
  return note.title?.trim() || '未命名笔记';
}

export function noteFolder(note) {
  return (note.folder || '').split('/').map(part => part.trim()).filter(Boolean).join('/') || '未分类';
}

export function parseTags(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[,，\n]/);
  return [...new Set(items.map(tag => String(tag).trim().replace(/^#/, '')).filter(Boolean))];
}

export function sortNotes(notes, pinnedFirst = true) {
  return [...notes].sort((left, right) => {
    const pinned = pinnedFirst ? Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) : 0;
    const leftTime = Date.parse(left.updatedAt || left.createdAt) || 0;
    const rightTime = Date.parse(right.updatedAt || right.createdAt) || 0;
    return pinned || rightTime - leftTime || noteTitle(left).localeCompare(noteTitle(right), 'zh-CN');
  });
}

export function filterNotes(notes, { query = '', folder = '', tag = '', view = '' } = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return sortNotes(notes.filter(note => {
    const currentFolder = noteFolder(note);
    if (folder && currentFolder !== folder && !currentFolder.startsWith(`${folder}/`)) return false;
    if (tag && !parseTags(note.tags).includes(tag)) return false;
    if (view === 'pinned' && !note.pinned) return false;
    const text = [noteTitle(note), note.content, note.summary, currentFolder, ...parseTags(note.tags)]
      .join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  }), view !== 'recent');
}

export function buildNoteTree(notes) {
  const roots = [];
  const folders = new Map();
  for (const note of sortNotes(notes)) {
    const parts = noteFolder(note).split('/');
    let children = roots;
    let current;
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join('/');
      if (!folders.has(path)) {
        const node = { name, path, children: [], notes: [], count: 0 };
        folders.set(path, node);
        children.push(node);
      }
      current = folders.get(path);
      current.count += 1;
      children = current.children;
    });
    current.notes.push(note);
  }
  const sortTree = nodes => nodes.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    .map(node => ({ ...node, children: sortTree(node.children) }));
  return sortTree(roots);
}

export function readingStats(content = '') {
  const words = String(content).match(/\p{Script=Han}|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu) || [];
  return { words: words.length, minutes: Math.max(1, Math.ceil(words.length / 300)) };
}

export function noteExcerpt(note) {
  if (note.summary?.trim()) return note.summary.trim();
  return (note.content || '').replace(/```[^\n]*\n[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function formatNoteDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未记录';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function exportNoteMarkdown(note) {
  const metadata = [
    `目录：${noteFolder(note)}`,
    `类型：${NOTE_TYPES.find(type => type.id === note.type)?.label || '笔记'}`,
    `状态：${note.status === 'ready' ? '已整理' : '待整理'}`,
    parseTags(note.tags).length ? `标签：${parseTags(note.tags).map(tag => `#${tag}`).join(' ')}` : '',
    note.createdAt ? `创建：${note.createdAt}` : '',
    note.updatedAt ? `更新：${note.updatedAt}` : '',
    safeSourceUrl(note.sourceUrl) ? `来源：${safeSourceUrl(note.sourceUrl)}` : '',
  ].filter(Boolean).join('  \n');
  const summary = note.summary?.trim() ? `${note.summary.trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n` : '';
  return `# ${noteTitle(note)}\n\n${summary}${note.content || ''}\n\n---\n\n${metadata}\n`;
}
