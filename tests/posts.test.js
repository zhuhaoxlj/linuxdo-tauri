import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePosts, postPayload, submittedPost, uploadMarkdown } from '../src/lib/posts.js';

test('new topics, replies, edits and private messages use their own server contracts', () => {
  assert.deepEqual(postPayload({ kind: 'topic', title: ' Test ', raw: ' Text ', categoryId: '6', tags: 'rust，tauri rust' }),
    { title: 'Test', raw: 'Text', archetype: 'regular', category: 6, tags: ['rust', 'tauri'] });
  assert.deepEqual(postPayload({ kind: 'reply', raw: 'reply', topicId: '42', replyTo: 3 }),
    { raw: 'reply', topic_id: 42, reply_to_post_number: 3 });
  assert.deepEqual(postPayload({ kind: 'message', title: 'message', raw: 'body', recipients: 'alice, bob' }),
    { raw: 'body', title: 'message', archetype: 'private_message', target_recipients: 'alice,bob' });
  assert.deepEqual(postPayload({ kind: 'edit', raw: 'fixed', editReason: 'typo' }),
    { post: { raw: 'fixed', edit_reason: 'typo' } });
});

test('invalid drafts are rejected before any publishing request', () => {
  assert.throws(() => postPayload({ raw: '  ' }), /内容/);
  assert.throws(() => postPayload({ kind: 'topic', raw: 'body', title: 'test' }), /分类/);
  assert.throws(() => postPayload({ kind: 'message', raw: 'body', title: 'test', recipients: '' }), /收件人/);
  assert.throws(() => postPayload({ kind: 'reply', raw: 'body', topicId: 'unknown' }), /话题无效/);
});

test('queued posts never masquerade as a published topic; unknown outcomes are not auto-retried', () => {
  assert.deepEqual(submittedPost({ action: 'enqueued', pending_count: 1 }), { queued: true });
  assert.equal(submittedPost({ post: { id: 10, topic_id: 42 } }).post.id, 10);
  assert.throws(() => submittedPost({ success: true }), /刷新话题确认/);
});

test('post pages are merged in floor order without duplicating edited posts', () => {
  assert.deepEqual(mergePosts([{ id: 1, post_number: 1, cooked: 'old' }, { id: 3, post_number: 3 }],
    [{ id: 2, post_number: 2 }, { id: 1, post_number: 1, cooked: 'new' }]),
  [{ id: 1, post_number: 1, cooked: 'new' }, { id: 2, post_number: 2 }, { id: 3, post_number: 3 }]);
});

test('upload markdown distinguishes attachments from images and rejects executable URLs', () => {
  assert.equal(uploadMarkdown({ short_url: 'upload://abc.png' }, { name: 'photo.png', type: 'image/png' }), '![photo.png](upload://abc.png)');
  assert.equal(uploadMarkdown({ url: '/uploads/log.txt' }, { name: 'log.txt', type: 'text/plain' }), '[log.txt](/uploads/log.txt)');
  assert.throws(() => uploadMarkdown({ url: 'javascript:alert(1)' }, { name: 'bad' }), /有效附件地址/);
});
