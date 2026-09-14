import React, { createContext, useContext, useState, useEffect } from 'react';

const BoardContext = createContext();

const DEFAULT_CATEGORIES = [
  { id: 'home', name: '首页', icon: '🏠', color: '#6366f1' },
  { id: 'life', name: '生活', icon: '🌟', color: '#10b981' },
  { id: 'work', name: '工作', icon: '💼', color: '#f59e0b' },
  { id: 'knowledge', name: '知识库', icon: '📚', color: '#8b5cf6' },
  { id: 'sync', name: '同步空间', icon: '☁️', color: '#4974bb' },
  { id: 'entertainment', name: '娱乐', icon: '🎮', color: '#ec4899' },
  { id: 'linuxdo', name: 'LinuxDo', icon: '🐧', color: '#06b6d4' }
];

export const KANBAN_COLUMNS = [
  { id: 'inbox', name: 'inbox' },
  { id: 'todo', name: 'todo' },
  { id: 'doing', name: 'doing' },
  { id: 'done', name: 'done' },
];

const STORAGE_KEY = 'board-data-v1';

function withColumn(task) {
  if (task.column && KANBAN_COLUMNS.some(column => column.id === task.column)) return task;
  return { ...task, column: task.completed ? 'done' : 'inbox' };
}

function insertTask(list, task, beforeId) {
  if (!beforeId) return [...list, task];
  const index = list.findIndex(item => item.id === beforeId);
  if (index === -1) return [...list, task];
  return [...list.slice(0, index), task, ...list.slice(index)];
}

export function BoardProvider({ children }) {
  const [categories] = useState(DEFAULT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState('home');
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (!Array.isArray(data.tasks || []) || !Array.isArray(data.notes || [])) {
          throw new Error('Invalid board data');
        }
        setTasks((data.tasks || []).map(withColumn));
        setNotes(data.notes || []);
        setActiveCategory(data.activeCategory || 'home');
      }
      setStorageReady(true);
    } catch (error) {
      console.error('Failed to load data:', error);
      setStorageError('本地数据读取失败，已停止自动保存，避免覆盖原有内容。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && storageReady) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          tasks,
          notes,
          activeCategory
        }));
        setStorageError('');
      } catch (error) {
        console.error('Failed to save data:', error);
        setStorageError('未能保存到本地，可能是存储空间不足。请先复制正在编辑的 Markdown，避免内容丢失。');
      }
    }
  }, [tasks, notes, activeCategory, loading, storageReady]);

  const addTask = (task) => {
    const column = task.column || 'inbox';
    setTasks(prev => [...prev, withColumn({
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...task,
      column,
      images: task.images || [],
      completed: column === 'done',
    })]);
  };

  const updateTask = (id, updates) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      const next = withColumn({ ...task, ...updates, updatedAt: new Date().toISOString() });
      return { ...next, completed: next.column === 'done' };
    }));
  };

  const deleteTask = (id) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  const toggleTask = (id) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      const column = task.column === 'done' ? 'inbox' : 'done';
      return { ...task, column, completed: column === 'done', updatedAt: new Date().toISOString() };
    }));
  };

  const moveTask = (id, column, beforeId) => {
    setTasks(prev => {
      const current = prev.find(task => task.id === id);
      if (!current) return prev;
      const rest = prev.filter(task => task.id !== id);
      const moved = withColumn({ ...current, column, completed: column === 'done', updatedAt: new Date().toISOString() });
      return insertTask(rest, moved, beforeId);
    });
  };

  const addNote = (note) => {
    const timestamp = new Date().toISOString();
    const created = { ...note, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp };
    setNotes(prev => [...prev, created]);
    return created;
  };

  const updateNote = (id, updates) => {
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, ...updates, updatedAt: new Date().toISOString() } : note
    ));
  };

  const deleteNote = (id) => {
    setNotes(prev => prev.filter(note => note.id !== id));
  };

  const value = {
    categories,
    activeCategory,
    setActiveCategory,
    tasks,
    notes,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
    moveTask,
    addNote,
    updateNote,
    deleteNote,
    loading,
    storageError,
    storageReady,
  };

  return (
    <BoardContext.Provider value={value}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard() {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error('useBoard must be used within BoardProvider');
  }
  return context;
}
