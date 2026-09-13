import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { draftKey, readLocal } from '../lib/storage';
import { topicPath } from '../lib/api';
import { PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';
import Composer from '../components/Composer';

export default function ComposePage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const kind = params.get('type') === 'message' ? 'message' : 'topic';
  const draftId = params.get('draft') || (kind === 'message' ? 'message:' + (params.get('to') || 'new') : 'new-topic');
  const saved = readLocal(draftKey(user?.username), {})[draftId];
  const initial = saved || { kind, recipients: params.get('to') || '', categoryId: params.get('category') || '' };
  const title = initial.kind === 'edit' ? '继续编辑帖子' : initial.kind === 'reply' ? '继续回复' : initial.kind === 'message' ? '写一封私信' : '发起新的对话';
  return <div className="compose-page"><PageHeading eyebrow="CREATE" title={title} description="认真表达，友善交流。你的内容会让社区更丰富。" back="/" /><AuthRequired>{user && <Composer key={draftId} initial={initial} draftId={draftId} onSubmitted={result => navigate(result.queued ? '/pending' : topicPath(result.post.topic_id, result.post.post_number))} />}</AuthRequired></div>;
}
