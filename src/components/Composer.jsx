import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bold, Code, Eye, Italic, Link as LinkIcon, List, LoaderCircle, Paperclip, PenLine, Quote, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp, useSite } from '../context/AppContext';
import { api, errorText, uploadFile } from '../lib/api';
import { cook } from '../lib/cook';
import { draftKey, readLocal, removeDraft, saveDraft } from '../lib/storage';
import { postPayload, submittedPost, uploadMarkdown } from '../lib/posts';
import Cooked from './Cooked';

export default function Composer({ initial = {}, draftId, onSubmitted, onCancel }) {
  const { user } = useAuth();
  const { notify } = useApp();
  const site = useSite();
  const queries = useQueryClient();
  const [draft, setDraft] = useState(() => ({
    kind: 'topic', title: '', raw: '', categoryId: '', tags: '', recipients: '',
    ...initial, ...readLocal(draftKey(user?.username), {})[draftId],
  }));
  const [mode, setMode] = useState('write');
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const editor = useRef(null);
  const files = useRef(null);
  const latest = useRef(draft);
  const submitted = useRef(false);
  const changed = useRef(false);
  latest.current = draft;

  useEffect(() => {
    if (!changed.current) return;
    try { saveDraft(user?.username, draftId, draft); setSaveError(''); }
    catch { setSaveError('本地空间不足，草稿未保存，请复制内容后再离开'); }
  }, [draft, draftId, user?.username]);
  useEffect(() => () => {
    if (changed.current && !submitted.current) {
      try { saveDraft(user?.username, draftId, latest.current); } catch { /* The editor already displays the persistence error. */ }
    }
  }, [draftId, user?.username]);
  useEffect(() => {
    if (mode !== 'preview') return;
    let cancelled = false;
    const timer = setTimeout(() => cook(draft.raw, site.data).then(value => {
      if (!cancelled) { setPreview(value); setPreviewError(''); }
    }).catch(error => { if (!cancelled) setPreviewError(errorText(error)); }), 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draft.raw, mode, site.data]);

  const patch = value => { changed.current = true; setDraft(current => ({ ...current, ...value })); };
  const insert = (prefix, suffix = '', placeholder = '') => {
    const area = editor.current;
    const start = area?.selectionStart ?? draft.raw.length;
    const end = area?.selectionEnd ?? start;
    const selected = draft.raw.slice(start, end) || placeholder;
    patch({ raw: draft.raw.slice(0, start) + prefix + selected + suffix + draft.raw.slice(end) });
    setMode('write');
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(start + prefix.length, start + prefix.length + selected.length); });
  };
  const attach = async fileList => {
    if (!fileList?.length || uploading) return;
    setUploading(true);
    try {
      const markdown = [];
      for (const file of Array.from(fileList)) markdown.push(uploadMarkdown(await uploadFile(file), file));
      patch({ raw: latest.current.raw + '\n' + markdown.join('\n') + '\n' });
      setMode('write');
    } catch (error) { notify(errorText(error)); }
    finally { setUploading(false); if (files.current) files.current.value = ''; }
  };
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = postPayload(draft);
      const response = draft.kind === 'edit'
        ? await api.put('/posts/' + draft.postId + '.json', payload)
        : await api.post('/posts.json', payload);
      return submittedPost(response);
    },
    onSuccess: result => {
      submitted.current = true;
      removeDraft(user?.username, draftId);
      queries.invalidateQueries({ queryKey: ['topics'] });
      queries.invalidateQueries({ queryKey: ['topic'] });
      queries.invalidateQueries({ queryKey: ['messages'] });
      notify(result.queued ? '已提交，正在等待社区审核' : draft.kind === 'edit' ? '修改已保存' : '发送成功');
      onSubmitted?.(result);
    },
  });
  const writingTopic = ['topic', 'message'].includes(draft.kind);
  const submitLabel = draft.kind === 'edit' ? '保存修改' : draft.kind === 'reply' ? '发布回复' : draft.kind === 'message' ? '发送私信' : '发布话题';
  const tick = String.fromCharCode(96);
  return <form className="composer panel" onSubmit={event => { event.preventDefault(); if (!uploading && !mutation.isPending) mutation.mutate(); }}
    onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
    {writingTopic && <label className="field"><span>标题</span><input autoFocus aria-label="标题" placeholder="一个清晰的标题，让对话有个好开始" value={draft.title} onChange={event => patch({ title: event.target.value })} required maxLength={Number(site.data?.site_settings?.max_topic_title_length) || 255} /></label>}
    {draft.kind === 'topic' && <div className="form-row"><label className="field"><span>分类</span><select aria-label="分类" value={draft.categoryId} onChange={event => patch({ categoryId: event.target.value })} required><option value="">选择一个分类</option>{(site.data?.categories || []).filter(category => category.permission !== 3).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="field"><span>标签 <small>可选，逗号分隔</small></span><input aria-label="标签" value={draft.tags} onChange={event => patch({ tags: event.target.value })} placeholder="tauri, rust" /></label></div>}
    {draft.kind === 'message' && <label className="field"><span>收件人</span><input aria-label="收件人" value={draft.recipients} onChange={event => patch({ recipients: event.target.value })} placeholder="用户名，多位收件人用逗号分隔" required /></label>}
    <div className="editor-toolbar"><div className="editor-tools">
      {[[Bold, '加粗', '**', '**', '加粗文字'], [Italic, '斜体', '*', '*', '斜体文字'], [Code, '代码', tick + tick + tick + '\n', '\n' + tick + tick + tick, '代码'], [LinkIcon, '链接', '[', '](https://)', '链接文字'], [Quote, '引用', '> ', '', '引用内容'], [List, '列表', '\n- ', '', '列表项']].map(([Icon, label, prefix, suffix, placeholder]) => <button type="button" className="icon-button" aria-label={label} title={label} key={label} onClick={() => insert(prefix, suffix, placeholder)}><Icon size={17} /></button>)}
      <button type="button" className="icon-button" aria-label="上传附件" title="上传附件" disabled={uploading || mutation.isPending} onClick={() => files.current?.click()}>{uploading ? <LoaderCircle className="spin" size={17} /> : <Paperclip size={17} />}</button><input className="sr-only" ref={files} type="file" multiple tabIndex={-1} onChange={event => attach(event.target.files)} />
    </div><div className="segmented"><button type="button" className={mode === 'write' ? 'active' : ''} onClick={() => setMode('write')}><PenLine size={14} />编辑</button><button type="button" className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}><Eye size={14} />预览</button></div></div>
    {mode === 'write' ? <textarea ref={editor} className="markdown-editor" aria-label="正文" placeholder="分享你的想法… 支持 Markdown、拖放或粘贴图片。" value={draft.raw} onChange={event => patch({ raw: event.target.value })} required
      onPaste={event => { const pasted = Array.from(event.clipboardData?.files || []); if (pasted.length) { event.preventDefault(); attach(pasted); } }}
      onDragOver={event => event.preventDefault()} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); attach(event.dataTransfer.files); } }} />
      : <div className="editor-preview">{previewError ? <p className="inline-error" role="alert">{previewError}</p> : preview ? <Cooked html={preview} /> : <p className="muted">写点什么，再看看效果。</p>}</div>}
    {draft.kind === 'edit' && <label className="field edit-reason"><span>修改原因 <small>可选</small></span><input aria-label="修改原因" value={draft.editReason || ''} onChange={event => patch({ editReason: event.target.value })} /></label>}
    {(mutation.error || saveError) && <p className="inline-error" role="alert">{saveError || errorText(mutation.error)}</p>}
    <footer className="composer-footer"><span className="muted">{uploading ? '正在上传附件…' : saveError ? '草稿未保存' : '草稿自动保存在此设备'}<small>Ctrl + Enter 发送</small></span><div>{onCancel && <button type="button" className="button secondary" disabled={mutation.isPending} onClick={onCancel}>收起</button>}<button className="button primary" type="submit" disabled={uploading || mutation.isPending || !draft.raw.trim()}>{mutation.isPending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}{submitLabel}</button></div></footer>
  </form>;
}
