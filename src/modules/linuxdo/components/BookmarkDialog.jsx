import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../lib/api';
import { useApp } from '../context/AppContext';
import Dialog from './Dialog';

export default function BookmarkDialog({ postId, bookmark, onClose, onSaved }) {
  const [name, setName] = useState(bookmark?.name || '');
  const [reminder, setReminder] = useState('');
  const queries = useQueryClient();
  const { notify } = useApp();
  const mutation = useMutation({
    mutationFn: remove => remove
      ? api.delete('/bookmarks/' + bookmark.id + '.json')
      : bookmark ? api.put('/bookmarks/' + bookmark.id + '.json', { name, ...(reminder ? { reminder_at: new Date(reminder).toISOString() } : {}) })
        : api.post('/bookmarks.json', { bookmarkable_id: postId, bookmarkable_type: 'Post', name, ...(reminder ? { reminder_at: new Date(reminder).toISOString() } : {}) }),
    onSuccess: async (_, remove) => {
      await Promise.all([queries.invalidateQueries({ queryKey: ['bookmarks'] }), queries.invalidateQueries({ queryKey: ['topic'] })]);
      onSaved?.();
      notify(remove ? '已移除书签' : '书签已保存');
      onClose();
    },
  });
  return <Dialog title={bookmark ? '编辑书签' : '添加书签'} onClose={onClose}><form className="dialog-body" onSubmit={event => { event.preventDefault(); mutation.mutate(false); }}>
    <label className="field"><span>备注 <small>可选</small></span><input aria-label="书签备注" value={name} onChange={event => setName(event.target.value)} placeholder="给以后回来的自己留个提示" /></label>
    <label className="field"><span>提醒时间 <small>可选</small></span><input aria-label="书签提醒时间" type="datetime-local" value={reminder} onChange={event => setReminder(event.target.value)} /></label>
    {bookmark?.reminder_at && <p className="muted">当前提醒：{new Date(bookmark.reminder_at).toLocaleString('zh-CN')}</p>}
    {mutation.error && <p className="inline-error" role="alert">{errorText(mutation.error)}</p>}
    <div className="dialog-actions">{bookmark && <button className="button danger subtle" type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>移除书签</button>}<button className="button primary" type="submit" disabled={mutation.isPending}>保存书签</button></div>
  </form></Dialog>;
}
