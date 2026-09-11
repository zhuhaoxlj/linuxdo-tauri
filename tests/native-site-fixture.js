// Injected only by WebDriver into an isolated profile. Every write below is in memory.
window.stop();
const ago = minutes => new Date(Date.now() - minutes * 60000).toISOString();
const fixtureUser = { id: 42, username: 'native-test-user', name: '测试用户', avatar_template: '', trust_level: 2 };
const helper = { id: 43, username: 'helper', name: '社区伙伴', avatar_template: '', trust_level: 3 };
const categories = [
  { id: 6, slug: 'development', name: '开发调优', description_text: '分享技术经验，交流开发心得。', color: '6e98cc', topic_count: 1284, permission: 1 },
  { id: 7, slug: 'general', name: '日常闲聊', description_text: '分享生活中的趣事，让彼此更近一点。', color: '78ac98', topic_count: 3201, permission: 1 },
  { id: 8, slug: 'resources', name: '资源荟萃', description_text: '让有价值的资源被更多人发现。', color: 'b99570', topic_count: 876, permission: 1 },
];
const makePost = (id, topicId, floor, raw, author = helper) => ({
  id, topic_id: topicId, post_number: floor, raw, cooked: '<p>' + raw + '</p>',
  ...author, user_id: author.id, id, name: author.name, username: author.username,
  created_at: ago(60 - floor * 6), actions_summary: [{ id: 2, count: 3, acted: false, can_act: true }],
  can_edit: author.id === 42, can_delete: author.id === 42,
});
const topicNames = [
  'Native login regression topic · 用 Tauri 2 打造轻量桌面应用',
  '周末项目：把自己的工作流做成开源工具',
  'Rust 异步编程，从一个小服务开始',
  '分享几本最近读完、值得推荐的技术书',
  '记录一次 Linux 桌面环境的配置过程',
  '你在用哪些提升效率的小工具？',
  '关于开源协作，我们可以做得更好',
];
const fixture = window.__fixture = {
  calls: [], bookmarks: [], pending: [], created: 0,
  users: [fixtureUser, helper], categories,
  topics: topicNames.map((title, index) => ({
    id: index + 1, title, category_id: 6 + index % 3, posts_count: index ? 2 + index * 3 : 3,
    highest_post_number: index ? 2 + index * 3 : 3, like_count: 8 + index * 7, views: 210 + index * 158,
    pinned: index === 1, tags: index % 2 ? ['分享'] : ['rust', 'tauri'],
    posters: [{ user_id: 43 }], last_posted_at: ago(index * 73 + 3), created_at: ago(300 + index * 80),
  })),
  posts: {
    1: [makePost(101, 1, 1, '这是一篇关于 Tauri 2 的分享。轻量的窗口、清晰的界面，让阅读和交流更专注。'),
        makePost(102, 1, 2, '谢谢分享！浏览器授权回调、会话恢复和论坛操作都值得认真验证。', fixtureUser),
        makePost(103, 1, 3, '楼层分页测试：前面的讨论已经加载完成。')],
  },
  notifications: [{ id: 201, topic_id: 1, post_number: 2, notification_type: 2, read: false, created_at: ago(5), data: { display_username: 'helper', topic_title: topicNames[0] } }],
  chatMessages: [{ id: 501, message: '欢迎来到测试频道', cooked: '<p>欢迎来到测试频道，这里的消息都是隔离测试数据。</p>', user: helper, created_at: ago(3), reactions: [], uploads: [] }],
  channel: { id: 7, title: '开发交流', unicode_title: '开发交流', description: '分享小问题，碰撞新想法', chatable_type: 'Category', status: 'open', current_user_membership: { following: true, last_read_message_id: 500 }, meta: { can_delete_self: true }, last_message: { id: 501 } },
};
fixture.posts[1][0].cooked += '<h3>这次想解决什么</h3><ul><li>可靠的浏览器登录</li><li>舒服的阅读体验</li><li>流畅的社区交流</li></ul><pre><code class="language-rust">fn main() {\n    println!("Hello, community!");\n}</code></pre>';
fixture.posts[1][0].polls = [{ id: 1, name: 'poll', title: '你最关心的桌面体验', type: 'regular', status: 'open', results: 'always', voters: 4, options: [{ id: 'a', html: '速度与内存占用', votes: 3 }, { id: 'b', html: '阅读与交互细节', votes: 1 }] }];
fixture.posts[1][1].cooked += '<img src="" onerror="window.__unsafeRendered=true"><script>window.__unsafeRendered=true</script><a href="javascript:window.__unsafeRendered=true">不可执行链接</a>';
for (const topic of fixture.topics.slice(1)) fixture.posts[topic.id] = [makePost(topic.id * 100 + 1, topic.id, 1, topic.title)];
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
window.fetch = async (input, options = {}) => {
  const url = new URL(input, 'https://linux.do');
  const path = url.pathname;
  const method = options.method || 'GET';
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const ok = () => json({ success: true });
  if (path === '/session/csrf.json') return json({ csrf: 'native-test-csrf' });
  if (path === '/session/otp/abc123def456') {
    if (method !== 'POST' || options.headers['X-CSRF-Token'] !== 'native-test-csrf') return new Response(null, { status: 403 });
    document.cookie = '_t=native-test-cookie; Path=/; Secure; SameSite=Lax; Max-Age=3600';
    return { ok: false, status: 0, type: 'opaqueredirect', headers: new Headers() };
  }
  if (path === '/session/current.json') return json({ current_user: fixtureUser });
  if (path === '/user-api-key/revoke') return ok();
  fixture.calls.push({ path, method, body: options.body instanceof FormData ? { file: options.body.get('file')?.name, upload_type: options.body.get('upload_type') } : body, query: url.search });
  if (method !== 'GET' && !path.startsWith('/message-bus/') && options.headers['X-CSRF-Token'] !== 'native-test-csrf') return json({ errors: ['Missing fixture CSRF'] }, 403);
  if (path === '/native-slow') { await new Promise(resolve => setTimeout(resolve, 200)); return ok(); }
  if (path === '/native-fast') return ok();
  if (path === '/site.json') return json({ categories, top_tags: [{ name: 'rust' }, { name: 'tauri' }, { name: '分享' }], site_settings: { max_topic_title_length: 255 }, post_action_types: [] });
  if (path === '/tags.json') return json({ tags: [{ id: 1, name: 'rust', count: 56 }, { id: 2, name: 'tauri', count: 37 }], extras: { tag_groups: [] } });
  if (/^\/(latest|hot|top|new|unread|read)\.json$/.test(path) || path.startsWith('/c/') || path.startsWith('/tag/') || path.startsWith('/topics/created-by/') || path.startsWith('/topics/private-messages')) return json({ users: fixture.users, topic_list: { topics: fixture.topics, more_topics_url: null } });
  const topicMatch = path.match(/^\/t\/(\d+)(?:\/(\d+))?\.json$/);
  if (topicMatch) {
    const id = Number(topicMatch[1]), floor = Number(topicMatch[2] || 1);
    const topic = fixture.topics.find(item => item.id === id);
    if (!topic) return json({ errors: ['话题不存在'] }, 404);
    const posts = fixture.posts[id] || [];
    return json({ ...topic, posts_count: posts.length, highest_post_number: posts.at(-1)?.post_number || 1,
      post_stream: { posts: floor > 2 ? posts.filter(post => post.post_number >= floor) : posts.slice(0, 2), stream: posts.map(post => post.id) },
      details: { can_create_post: true, notification_level: 1 }, bookmarks: fixture.bookmarks, suggested_topics: fixture.topics.slice(1, 3),
    });
  }
  const postsMatch = path.match(/^\/t\/(\d+)\/posts\.json$/);
  if (postsMatch) return json({ post_stream: { posts: (fixture.posts[Number(postsMatch[1])] || []).filter(post => url.searchParams.getAll('post_ids[]').map(Number).includes(post.id)) } });
  if (path === '/posts.json' && method === 'POST') {
    if (body.raw.includes('[queue-fixture]')) { fixture.pending.push({ id: 71, raw: body.raw, title: body.title }); return json({ action: 'enqueued', pending_count: 1 }); }
    let id = Number(body.topic_id);
    if (!id) {
      id = fixture.topics.length + 1;
      fixture.topics.unshift({ id, title: body.title, archetype: body.archetype, category_id: body.category, tags: body.tags || [], posts_count: 1, posters: [{ user_id: 42 }], last_posted_at: ago(0) });
      fixture.posts[id] = [];
    }
    const posts = fixture.posts[id];
    const post = makePost(1000 + fixture.created++, id, posts.length + 1, escape(body.raw), fixtureUser);
    post.raw = body.raw;
    post.reply_to_post_number = body.reply_to_post_number;
    posts.push(post);
    return json(post);
  }
  const postMatch = path.match(/^\/posts\/(\d+)\.json$/);
  if (postMatch) {
    const post = Object.values(fixture.posts).flat().find(item => item.id === Number(postMatch[1]));
    if (!post) return json({ errors: ['帖子不存在'] }, 404);
    if (method === 'PUT') { post.raw = body.post.raw; post.cooked = '<p>' + escape(post.raw) + '</p>'; }
    if (method === 'DELETE') { post.deleted_at = ago(0); return new Response(null, { status: 204 }); }
    return json(post);
  }
  if (path === '/post_actions' || path.startsWith('/post_actions/')) {
    const id = body?.id || Number(path.split('/').at(-1));
    const post = Object.values(fixture.posts).flat().find(item => item.id === id);
    const like = post.actions_summary[0];
    like.acted = method !== 'DELETE'; like.count += like.acted ? 1 : -1;
    return json(post);
  }
  if (path === '/bookmarks.json' && method === 'POST') {
    const post = Object.values(fixture.posts).flat().find(item => item.id === body.bookmarkable_id);
    const topic = fixture.topics.find(item => item.id === post?.topic_id);
    const bookmark = { ...body, id: 700 + fixture.bookmarks.length, topic_id: post?.topic_id, linked_post_number: post?.post_number, title: topic?.title, created_at: ago(0) };
    fixture.bookmarks.push(bookmark);
    if (post) post.bookmark_id = bookmark.id;
    return json(bookmark);
  }
  const bookmarkMatch = path.match(/^\/bookmarks\/(\d+)\.json$/);
  if (bookmarkMatch) {
    const id = Number(bookmarkMatch[1]);
    if (method === 'DELETE') {
      fixture.bookmarks = fixture.bookmarks.filter(item => item.id !== id);
      for (const post of Object.values(fixture.posts).flat()) if (post.bookmark_id === id) delete post.bookmark_id;
      return new Response(null, { status: 204 });
    }
    Object.assign(fixture.bookmarks.find(item => item.id === id), body); return ok();
  }
  if (/^\/u\/[^/]+\/bookmarks\.json$/.test(path)) return json({ user_bookmark_list: { bookmarks: fixture.bookmarks, more_bookmarks_url: null } });
  if (path === '/uploads.json') return json({ id: 801, short_url: 'upload://fixture.txt', url: 'https://linux.do/uploads/fixture.txt', original_filename: body.get('file')?.name || 'fixture.txt' });
  if (path === '/uploads/lookup-urls') return json(body.short_urls.map(short_url => ({ short_url, url: 'https://linux.do/uploads/fixture.png' })));
  if (path === '/search.json') return json({ posts: [{ id: 101, topic_id: 1, post_number: 1, username: helper.username, blurb: 'Tauri 2 搜索结果' }], topics: [fixture.topics.find(item => item.id === 1)], users: [], grouped_search_result: { more_full_page_results: false } });
  if (path === '/notifications' || path === '/notifications.json') return json({ notifications: fixture.notifications, unread_notifications: fixture.notifications.filter(item => !item.read).length });
  if (path === '/notifications/mark-read') { fixture.notifications.forEach(item => { if (!body?.id || item.id === body.id) item.read = true; }); return ok(); }
  if (path === '/drafts.json') return json({ drafts: [] });
  if (/^\/posts\/[^/]+\/pending\.json$/.test(path)) return json({ pending_posts: fixture.pending });
  if (/^\/review\/\d+$/.test(path)) { fixture.pending = fixture.pending.filter(item => item.id !== Number(path.split('/').at(-1))); return ok(); }
  if (path === '/topics/timings' || /^\/t\/\d+\/notifications$/.test(path)) return ok();
  if (path === '/polls/vote') {
    const post = Object.values(fixture.posts).flat().find(item => item.id === body.post_id);
    post.polls_votes = { [body.poll_name]: body.options };
    const poll = post.polls.find(item => item.name === body.poll_name);
    poll.voters++; poll.options.forEach(item => { if (body.options.includes(item.id)) item.votes++; });
    return json({ poll });
  }
  if (/^\/u\/[^/]+\/summary\.json$/.test(path)) return json({ user_summary: { likes_received: 42, likes_given: 31, topic_count: 7, post_count: 28, posts_read_count: 512, days_visited: 36, topics: [fixture.topics[0]] } });
  if (/^\/u\/[^/]+\/follow\/(following|followers)$/.test(path)) return json([helper]);
  if (path.startsWith('/follow/')) { helper.is_followed = method === 'PUT'; return ok(); }
  if (/^\/u\/[^/]+\.json$/.test(path)) {
    const who = path.includes('native-test-user') ? fixtureUser : helper;
    if (method === 'PUT') Object.assign(who, body);
    return json({ user: { ...who, bio_raw: who.bio_raw || '热爱技术，乐于分享。', bio_cooked: '<p>热爱技术，乐于分享。</p>', created_at: ago(90 * 24 * 60), total_followers: 16, total_following: 23, can_follow: true, can_send_private_message_to_user: true } });
  }
  if (path === '/user_actions.json') return json({ user_actions: [{ topic_id: 1, post_id: 101, post_number: 1, title: topicNames[0], excerpt: '<p>一条社区动态</p>', created_at: ago(30) }] });
  const badge = { id: 1, name: '初次分享', description: '发布第一条有价值的分享。', badge_type_id: 3, grant_count: 230 };
  if (path === '/badges.json' || path.startsWith('/user-badges/')) return json({ badges: [badge] });
  if (path.startsWith('/badges/')) return json({ badge });
  if (path === '/user_badges.json') return json({ users: [helper] });
  if (path === '/chat/api/me/channels') return json({ public_channels: [fixture.channel], direct_message_channels: [] });
  if (path === '/chat/api/channels') return json({ channels: [fixture.channel] });
  if (path === '/chat/api/direct-message-channels') return json({ channel: fixture.channel });
  if (/^\/chat\/api\/channels\/\d+$/.test(path)) return json({ channel: fixture.channel });
  if (/^\/chat\/api\/channels\/\d+(\/threads\/\d+)?\/messages$/.test(path) && method === 'GET') return json({ messages: fixture.chatMessages, meta: { can_load_more_past: false, can_load_more_future: false } });
  if (/^\/chat\/\d+$/.test(path) && method === 'POST') {
    const message = { id: 502 + fixture.created++, message: body.message, cooked: '<p>' + escape(body.message) + '</p>', user: fixtureUser, created_at: ago(0), reactions: [], uploads: [] };
    fixture.chatMessages.push(message); return json({ message_id: message.id });
  }
  if (/^\/chat\/api\/channels\/\d+\/messages\/\d+$/.test(path)) {
    const message = fixture.chatMessages.find(item => item.id === Number(path.split('/').at(-1)));
    if (method === 'DELETE') message.deleted_at = ago(0);
    if (method === 'PUT') { message.message = body.message; message.cooked = '<p>' + escape(body.message) + '</p>'; message.edited = true; }
    return ok();
  }
  if (/^\/chat\/api\/channels\/\d+(\/threads\/\d+)?\/read$/.test(path) || path.endsWith('/memberships/me')) return ok();
  if (/^\/chat\/\d+\/react\/\d+$/.test(path)) {
    const message = fixture.chatMessages.find(item => item.id === Number(path.split('/').at(-1)));
    message.reactions = body.react_action === 'add' ? [{ emoji: body.emoji, count: 1, reacted: true }] : [];
    return ok();
  }
  if (path.startsWith('/message-bus/')) { await new Promise(resolve => setTimeout(resolve, 200)); return json([]); }
  return json({ errors: ['Unexpected fixture request: ' + method + ' ' + path] }, 404);
};
