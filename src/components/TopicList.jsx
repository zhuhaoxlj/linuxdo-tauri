import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

function TopicList({ user, onLogout }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await invoke('fetch_topics');
      setTopics(result.topic_list?.topics || []);
    } catch (err) {
      console.error('加载话题失败:', err);
      setError('加载话题失败: ' + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">LinuxDo</h1>
        <div className="flex items-center gap-4">
          {user && <span className="text-gray-600">{user.username}</span>}
          <button
            onClick={onLogout}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            退出登录
          </button>
        </div>
      </div>

      {/* 话题列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            {topics.map((topic) => (
              <div
                key={topic.id}
                className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <h3 className="font-semibold text-lg mb-2">{topic.title}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>👁️ {topic.views}</span>
                  <span>💬 {topic.posts_count}</span>
                  <span>👍 {topic.like_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TopicList;
