import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { latestTopicsQuery, preloadForum, siteQuery, topicsNextPageParam, topicsQueryKey } from '../src/modules/linuxdo/lib/queries.js';

function forumEnvironment(context, { fail } = {}) {
  const commands = [];
  const globals = {
    isTauri: true,
    window: {
      __TAURI_INTERNALS__: {
        async invoke(command, args) {
          commands.push({ command, args });
          if (fail && args?.path === fail) throw new Error('forum request failed');
          return { topic_list: { topics: [] } };
        },
      },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    context.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  return { commands };
}

function fakeClient() {
  const prefetched = [];
  const record = (type, options) => {
    prefetched.push({ type, options });
    return Promise.resolve(options.queryFn({ pageParam: options.initialPageParam })).then(() => type);
  };
  return {
    prefetched,
    prefetchQuery: options => record('query', options),
    prefetchInfiniteQuery: options => record('infinite', options),
  };
}

test('the latest feed key matches what the topics page builds', () => {
  assert.deepEqual(topicsQueryKey({ path: '/latest.json', period: 'weekly', username: 'alice' }), ['topics', '/latest.json', 'weekly', 'alice']);
  assert.deepEqual(latestTopicsQuery('alice').queryKey, ['topics', '/latest.json', 'weekly', 'alice']);
});

test('a logged out reader keeps the same key shape as the topics page', () => {
  assert.deepEqual(latestTopicsQuery(undefined).queryKey, ['topics', '/latest.json', 'weekly', undefined]);
});

test('the prefetched latest page uses the public feed without a period filter', async context => {
  const { commands } = forumEnvironment(context);
  await latestTopicsQuery('alice').queryFn({ pageParam: 0 });
  assert.deepEqual(commands, [{
    command: 'discourse_request',
    args: { path: '/latest.json', method: 'GET', body: null },
  }]);
});

test('the site query is shared with the app context and cached for five minutes', async context => {
  const { commands } = forumEnvironment(context);
  const site = siteQuery();
  assert.deepEqual(site.queryKey, ['site']);
  assert.equal(site.staleTime, 5 * 60_000);
  await site.queryFn();
  assert.deepEqual(commands, [{
    command: 'discourse_request',
    args: { path: '/site.json', method: 'GET', body: null },
  }]);
});

test('preloading warms the site session with both first-screen queries', async context => {
  const { commands } = forumEnvironment(context);
  const client = fakeClient();
  await preloadForum(client, 'alice');
  assert.deepEqual(client.prefetched.map(({ type }) => type), ['query', 'infinite']);
  assert.deepEqual(client.prefetched[0].options.queryKey, ['site']);
  assert.deepEqual(client.prefetched[1].options.queryKey, ['topics', '/latest.json', 'weekly', 'alice']);
  assert.deepEqual(commands.map(({ args }) => args.path), ['/site.json', '/latest.json']);
});

test('a failing warmup never rejects', async context => {
  forumEnvironment(context, { fail: '/latest.json' });
  const client = fakeClient();
  const result = await preloadForum(client, undefined);
  assert.equal(result.topics.status, 'rejected');
  assert.equal(result.site.status, 'fulfilled');
});

test('more pages are only offered when the feed reports them', () => {
  const withMore = { topic_list: { more_topics_url: '/latest?page=1', topics: [{ id: 1 }] } };
  assert.equal(topicsNextPageParam(withMore, [{}, {}]), 2);
  assert.equal(topicsNextPageParam({ topic_list: { more_topics_url: null, topics: [{ id: 1 }] } }, [{}]), undefined);
  assert.equal(topicsNextPageParam({ topic_list: { more_topics_url: '/latest?page=1', topics: [] } }, [{}]), undefined);
});

test('a warmed cache already holds the first page the topics page will ask for', async context => {
  const { commands } = forumEnvironment(context);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  try {
    await preloadForum(client, 'alice');
    const key = topicsQueryKey({ path: '/latest.json', period: 'weekly', username: 'alice' });
    const cached = client.getQueryData(key);
    assert.equal(cached.pages.length, 1);
    assert.equal(client.getQueryState(key).fetchStatus, 'idle');
    assert.ok(client.getQueryData(['site']));
    assert.deepEqual(commands.map(({ args }) => args.path), ['/site.json', '/latest.json']);
  } finally {
    client.clear();
  }
});
