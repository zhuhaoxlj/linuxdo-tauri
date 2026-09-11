export function postPayload(draft) {
  const raw = draft.raw?.trim();
  if (!raw) throw new Error('请先写下内容');
  if (draft.kind === 'reply') {
    if (!Number.isInteger(Number(draft.topicId)) || Number(draft.topicId) < 1) throw new Error('回复的话题无效');
    return {
      raw, topic_id: Number(draft.topicId),
      ...(draft.replyTo ? { reply_to_post_number: Number(draft.replyTo) } : {}),
    };
  }
  if (draft.kind === 'edit') return { post: { raw, edit_reason: draft.editReason || '' } };
  const title = draft.title?.trim();
  if (!title) throw new Error('请填写标题');
  if (draft.kind === 'message') {
    const recipients = draft.recipients?.split(/[,，\s]+/).filter(Boolean).join(',');
    if (!recipients) throw new Error('请填写收件人用户名');
    return { raw, title, archetype: 'private_message', target_recipients: recipients };
  }
  if (!draft.categoryId) throw new Error('请选择分类');
  return {
    raw, title, archetype: 'regular', category: Number(draft.categoryId),
    tags: [...new Set((draft.tags || '').split(/[,，\s]+/).filter(Boolean))],
  };
}

export function submittedPost(data) {
  if (data?.action === 'enqueued') return { queued: true };
  const post = data?.post || data;
  if (!post?.id || !post?.topic_id) throw new Error('服务器未返回帖子信息，请刷新话题确认后再操作');
  return { queued: false, post };
}

export function mergePosts(existing, incoming) {
  return [...new Map([...existing, ...incoming].map(post => [post.id, post])).values()]
    .sort((left, right) => left.post_number - right.post_number);
}

export function uploadMarkdown(upload, file) {
  const url = upload.short_url || upload.url;
  if (!url || !/^(upload:\/\/|https?:\/\/|\/)/i.test(url)) throw new Error('上传完成，但服务器没有返回有效附件地址');
  const name = (upload.original_filename || file.name || '附件').replace(/[\[\]\r\n]/g, '');
  return (file.type?.startsWith('image/') ? '!' : '') + '[' + name + '](' + url + ')';
}
