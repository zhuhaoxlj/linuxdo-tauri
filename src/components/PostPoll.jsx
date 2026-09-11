import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Cooked from './Cooked';

export default function PostPoll({ poll, post }) {
  const { user, requestLogin } = useAuth();
  const queries = useQueryClient();
  const [selection, setSelection] = useState(post.polls_votes?.[poll.name] || []);
  const [result, setResult] = useState(null);
  const current = result || poll;
  const multiple = current.type === 'multiple';
  const voted = Boolean(result) || Boolean(post.polls_votes?.[poll.name]?.length);
  const closed = current.status === 'closed';
  const [showResults, setShowResults] = useState(voted || closed);
  const mutation = useMutation({
    mutationFn: () => api.put('/polls/vote', { post_id: post.id, poll_name: poll.name, options: selection }),
    onSuccess: data => { setResult(data.poll); setShowResults(true); queries.invalidateQueries({ queryKey: ['topic'] }); },
  });
  const total = Number(current.voters) || 0;
  return <section className="poll"><h4>{current.title || '社区投票'}</h4><p className="muted">{multiple ? '多选' : '单选'}{current.min ? ' · 至少 ' + current.min + ' 项' : ''}{current.max ? ' · 最多 ' + current.max + ' 项' : ''} · {total} 人参与</p>
    <div className="poll-options">{(current.options || []).map(option => <label className={'poll-option ' + (selection.includes(option.id) ? 'selected' : '')} key={option.id}>
      {!showResults && !closed && <input type={multiple ? 'checkbox' : 'radio'} name={'poll-' + post.id + '-' + poll.name} checked={selection.includes(option.id)} onChange={() => setSelection(values => multiple ? values.includes(option.id) ? values.filter(id => id !== option.id) : [...values, option.id] : [option.id])} />}
      <Cooked html={option.html || option.id} />{showResults && <><span>{total ? Math.round((option.votes || 0) / total * 100) : 0}%</span><i className="poll-bar" style={{ width: (total ? Math.min(100, (option.votes || 0) / total * 100) : 0) + '%' }} /></>}
    </label>)}</div>
    {mutation.error && <p role="alert" className="inline-error">{errorText(mutation.error)}</p>}
    <div className="poll-actions">{!closed && !showResults && <button className="button primary small" disabled={!selection.length || mutation.isPending || (multiple && (selection.length < Number(current.min || 1) || selection.length > Number(current.max || Infinity)))} onClick={() => user ? mutation.mutate() : requestLogin()}>提交投票</button>}
      {!closed && <button className="button text small" onClick={() => setShowResults(value => !value)}>{showResults ? '选择选项' : '查看结果'}</button>}{closed && <span className="muted">投票已结束</span>}</div>
  </section>;
}
