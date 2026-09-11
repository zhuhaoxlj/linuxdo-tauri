import { useEffect, useRef } from 'react';
import { api } from './api';
import { recordVisit } from './storage';

export function useReadingProgress(topic, posts, user, enabled) {
  const latest = useRef(topic);
  latest.current = topic;
  const identity = posts.map(post => post.id).join(',');
  useEffect(() => {
    if (!topic || !enabled) return;
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const postNumber = Number(entry.target.dataset.postNumber);
        if (entry.isIntersecting) visible.add(postNumber);
        else visible.delete(postNumber);
      }
    }, { root: document.querySelector('.main-scroll'), threshold: 0.1 });
    document.querySelectorAll('.forum-post[data-post-number]').forEach(node => observer.observe(node));
    let timings = {};
    let activeTime = 0;
    const save = () => {
      if (!Object.keys(timings).length) return;
      const snapshot = timings;
      const duration = activeTime;
      timings = {}; activeTime = 0;
      if (user) api.post('/topics/timings', { topic_id: topic.id, topic_time: duration, timings: snapshot }).catch(() => {});
    };
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible' || !document.hasFocus() || !visible.size) return;
      activeTime += 1000;
      visible.forEach(number => { timings[number] = (timings[number] || 0) + 1000; });
      try { recordVisit(user?.username, latest.current, Math.max(...visible)); } catch { /* Reading still works with full local storage. */ }
      if (activeTime >= 10_000) save();
    }, 1000);
    return () => { clearInterval(tick); observer.disconnect(); save(); };
  }, [topic?.id, identity, user?.username, enabled]);
}
