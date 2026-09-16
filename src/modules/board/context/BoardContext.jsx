import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { clearVault, loadVault } from '../../sync/database';
import { hydrateCardImages, queueRecord, queueWorkspaceSnapshot, synchronize } from '../../sync/engine';
import { listDevices, revokeDevice } from '../../sync/api';
import { approvePairingCode, claimPairingSession, createPairingSession } from '../../sync/vault';
import { dayGoalToRecord, detachWorkspace, mergeWorkspace, noteToRecord, scheduleToRecord, taskRecordId, taskToRecord } from '../../sync/workspace';
import { acknowledgedDirtyIds } from '../../sync/pending';
import { writeSharedValue, writeSharedValueConfirmed } from '../../../shared/sharedStorage';
import { cancelFutureBlocks, dateBounds, DEFAULT_BLOCK_MS } from '../lib/schedule';

const BoardContext = createContext();

const DEFAULT_CATEGORIES = [
  { id: 'home', name: '首页', icon: '🏠', color: '#6366f1' },
  { id: 'life', name: '生活', icon: '🌟', color: '#10b981' },
  { id: 'work', name: '工作', icon: '💼', color: '#f59e0b' },
  { id: 'knowledge', name: '知识库', icon: '📚', color: '#8b5cf6' },
  { id: 'sync', name: '同步配对', icon: '☁️', color: '#4974bb' },
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
  const [schedules, setSchedules] = useState([]);
  const [dayGoals, setDayGoals] = useState([]);
  const [reminderOpen, setReminderOpen] = useState(null);
  const [tombstones, setTombstones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [syncConfig, setSyncConfig] = useState();
  const [syncStatus, setSyncStatus] = useState('loading');
  const [syncError, setSyncError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(0);
  const [pairing, setPairing] = useState();
  const [pairedDevices, setPairedDevices] = useState([]);
  const workspaceRef = useRef({ tasks: [], notes: [], schedules: [], dayGoals: [], tombstones: [] });
  const syncLock = useRef(false);
  const syncTimer = useRef();
  const queueChains = useRef(new Map());
  const syncTask = useRef(Promise.resolve());
  const syncGeneration = useRef(0);
  const disconnecting = useRef(false);
  const dirtySyncRevisions = useRef(new Map());
  const queuedSyncRevisions = useRef(new Map());
  const failedSyncRevisions = useRef(new Map());
  const syncRevision = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (![data.tasks || [], data.notes || [], data.schedules || [], data.dayGoals || []].every(Array.isArray)) {
          throw new Error('Invalid board data');
        }
        const restored = {
          tasks: (data.tasks || []).map(withColumn),
          notes: data.notes || [],
          schedules: data.schedules || [],
          dayGoals: data.dayGoals || [],
          tombstones: Array.isArray(data.tombstones) ? data.tombstones : [],
        };
        workspaceRef.current = restored;
        setTasks(restored.tasks);
        setNotes(restored.notes);
        setSchedules(restored.schedules);
        setDayGoals(restored.dayGoals);
        setTombstones(restored.tombstones);
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
        // 看板与知识库笔记同时写入本机与开发版/正式版共享文件
        writeSharedValue(STORAGE_KEY, JSON.stringify({
          tasks,
          notes,
          schedules,
          dayGoals,
          tombstones,
          activeCategory
        }));
        setStorageError('');
      } catch (error) {
        console.error('Failed to save data:', error);
        setStorageError('未能保存到本地，可能是存储空间不足。请先复制正在编辑的 Markdown，避免内容丢失。');
      }
    }
  }, [tasks, notes, schedules, dayGoals, tombstones, activeCategory, loading, storageReady]);

  useEffect(() => {
    workspaceRef.current = { tasks, notes, schedules, dayGoals, tombstones };
  }, [tasks, notes, schedules, dayGoals, tombstones]);

  useEffect(() => {
    loadVault()
      .then(config => {
        setSyncConfig(config);
        setSyncStatus(config ? 'pending' : 'unpaired');
      })
      .catch(error => {
        console.error('Failed to load sync vault:', error);
        setSyncStatus('error');
        setSyncError('同步密钥读取失败，请重新配对。');
      });
  }, []);

  useEffect(() => {
    if (!storageReady || !syncConfig) return undefined;
    void performSync(syncConfig, true);
    const interval = setInterval(() => void performSync(undefined, false), 15_000);
    return () => clearInterval(interval);
  }, [storageReady, syncConfig?.vaultId, syncConfig?.deviceId]);

  useEffect(() => {
    if (!pairing) return undefined;
    let cancelled = false;
    const poll = async () => {
      if (Math.floor(Date.now() / 1000) >= pairing.expiresAt) {
        setPairing(undefined);
        setSyncStatus('unpaired');
        setSyncError('配对请求已过期，请重新生成。');
        return;
      }
      try {
        const config = await claimPairingSession(pairing);
        if (!config || cancelled) return;
        setPairing(undefined);
        setSyncConfig(config);
        setSyncStatus('pending');
        setSyncError('');
      } catch (error) {
        if (!cancelled) setSyncError(error.message || '配对状态检查失败。');
      }
    };
    void poll();
    const interval = setInterval(poll, 2_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pairing]);

  async function performSync(configOverride, importLocal = false) {
    const config = configOverride || syncConfig;
    if (!config || disconnecting.current) return;
    if (syncLock.current) return syncTask.current;
    const generation = syncGeneration.current;
    const queuedAtStart = new Map(queuedSyncRevisions.current);
    syncLock.current = true;
    setSyncStatus('syncing');
    setSyncError('');
    const task = (async () => {
      let result = await synchronize(config);
      if (importLocal && await queueWorkspaceSnapshot(result.config, workspaceRef.current, result.records)) {
        result = await synchronize(result.config);
      }
      const imageMap = await hydrateCardImages(result.config, result.records);
      for (const id of acknowledgedDirtyIds(dirtySyncRevisions.current, queuedSyncRevisions.current, queuedAtStart, failedSyncRevisions.current, result.pendingIds)) {
        dirtySyncRevisions.current.delete(id);
        queuedSyncRevisions.current.delete(id);
      }
      const protectedIds = new Set([...result.pendingIds, ...dirtySyncRevisions.current.keys()]);
      const merged = mergeWorkspace(workspaceRef.current, result.records, imageMap, protectedIds);
      if (generation !== syncGeneration.current || disconnecting.current) return;
      workspaceRef.current = merged;
      setTasks(merged.tasks.map(withColumn));
      setNotes(merged.notes);
      setSchedules(merged.schedules);
      setDayGoals(merged.dayGoals);
      setTombstones(merged.tombstones);
      setSyncConfig(result.config);
      setSyncStatus(result.pending ? 'pending' : 'synced');
      setLastSyncedAt(Date.now());
      if (result.pending) scheduleSync(generation);
    })().catch(error => {
      if (generation !== syncGeneration.current || disconnecting.current) return;
      console.error('Workspace sync failed:', error);
      setSyncStatus(error?.status === 401 ? 'revoked' : navigator.onLine ? 'error' : 'offline');
      setSyncError(error.message || '同步失败，请稍后重试。');
    });
    syncTask.current = task;
    await task;
    if (syncTask.current === task) syncLock.current = false;
  }

  function scheduleSync(generation) {
    if (generation !== syncGeneration.current || disconnecting.current) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void performSync(undefined, false), 700);
  }

  function queueLocal(record, images) {
    if (!syncConfig || disconnecting.current) return;
    const generation = syncGeneration.current;
    const revision = ++syncRevision.current;
    dirtySyncRevisions.current.set(record.id, revision);
    setSyncStatus('pending');
    const previous = queueChains.current.get(record.id) || Promise.resolve();
    const current = previous.catch(() => undefined).then(() => {
      if (generation !== syncGeneration.current || disconnecting.current) return;
      return queueRecord(syncConfig, record, images).then(() => {
        queuedSyncRevisions.current.set(record.id, revision);
        if ((failedSyncRevisions.current.get(record.id) || 0) <= revision) failedSyncRevisions.current.delete(record.id);
      });
    }).then(() => scheduleSync(generation)).catch(error => {
      if (generation !== syncGeneration.current || disconnecting.current) return;
      failedSyncRevisions.current.set(record.id, revision);
      console.error('Failed to queue workspace item:', error);
      setSyncStatus('error');
      setSyncError(error.message || '本地变更未能加入同步队列。');
    });
    queueChains.current.set(record.id, current);
    current.then(() => {
      if (queueChains.current.get(record.id) === current) queueChains.current.delete(record.id);
    });
  }

  async function commitScheduledWorkspace(next, changedRecords) {
    if (!storageReady) throw new Error('正在读取本地数据，请稍后再试');
    try {
      await writeSharedValueConfirmed(STORAGE_KEY, JSON.stringify({ ...next, activeCategory }));
    } catch (error) {
      setStorageError(error.message || '排期保存失败');
      throw error;
    }
    workspaceRef.current = next;
    setTasks(next.tasks);
    setNotes(next.notes);
    setSchedules(next.schedules);
    setDayGoals(next.dayGoals);
    setTombstones(next.tombstones);
    changedRecords.forEach(record => queueLocal(record));
  }

  const addSchedule = async (taskId, plannedStart, duration = DEFAULT_BLOCK_MS) => {
    const task = workspaceRef.current.tasks.find(item => item.id === taskId);
    if (!task || task.column === 'done') throw new Error('无法安排已完成或不存在的任务');
    if (!Number.isFinite(plannedStart) || !Number.isFinite(duration) || duration < 15 * 60_000) throw new Error('时间范围无效');
    const now = new Date().toISOString();
    const block = {
      id: crypto.randomUUID(), taskId: taskRecordId(task), plannedStart, plannedEnd: plannedStart + duration,
      actualStart: null, actualEnd: null, status: 'pending', createdAt: now, updatedAt: now,
    };
    const next = { ...workspaceRef.current, schedules: [...workspaceRef.current.schedules, block] };
    await commitScheduledWorkspace(next, [scheduleToRecord(block)]);
    return block;
  };

  const updateSchedule = async (id, updates) => {
    const block = workspaceRef.current.schedules.find(item => item.id === id);
    if (!block) return;
    const updated = { ...block, ...updates, updatedAt: new Date().toISOString() };
    if (!Number.isFinite(updated.plannedStart) || !Number.isFinite(updated.plannedEnd) || updated.plannedStart >= updated.plannedEnd) {
      throw new Error('结束时间必须晚于开始时间');
    }
    await commitScheduledWorkspace({ ...workspaceRef.current, schedules: workspaceRef.current.schedules.map(item => item.id === id ? updated : item) }, [scheduleToRecord(updated)]);
  };

  const removeSchedule = async id => {
    const block = workspaceRef.current.schedules.find(item => item.id === id);
    if (!block) return;
    const deletedAt = Date.now();
    const tombstone = scheduleToRecord(block, { trashedAt: deletedAt, updatedAt: deletedAt });
    const next = {
      ...workspaceRef.current,
      schedules: workspaceRef.current.schedules.filter(item => item.id !== id),
      tombstones: [...workspaceRef.current.tombstones.filter(item => item.id !== tombstone.id), tombstone],
    };
    await commitScheduledWorkspace(next, [tombstone]);
  };

  const setDayGoal = async (date, minutes) => {
    dateBounds(date);
    if (minutes != null && (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440 || minutes % 15)) throw new Error('每日目标应为 15 分钟至 24 小时');
    const goalsForDate = workspaceRef.current.dayGoals.filter(item => item.date === date);
    const current = goalsForDate.find(item => !item.conflictOf);
    if (minutes == null) {
      if (!goalsForDate.length) return;
      const deletedAt = Date.now();
      const deletedRecords = goalsForDate.map(item => dayGoalToRecord(item, { trashedAt: deletedAt, updatedAt: deletedAt }));
      const deletedIds = new Set(deletedRecords.map(item => item.id));
      await commitScheduledWorkspace({ ...workspaceRef.current,
        dayGoals: workspaceRef.current.dayGoals.filter(item => item.date !== date),
        tombstones: [...workspaceRef.current.tombstones.filter(item => !deletedIds.has(item.id)), ...deletedRecords],
      }, deletedRecords);
      return;
    }
    const now = new Date().toISOString();
    const goal = { ...current, date, minutes, createdAt: current?.createdAt || now, updatedAt: now };
    await commitScheduledWorkspace({ ...workspaceRef.current,
      dayGoals: [...workspaceRef.current.dayGoals.filter(item => item !== current), goal],
    }, [dayGoalToRecord(goal)]);
  };

  const startSchedule = async id => {
    const block = workspaceRef.current.schedules.find(item => item.id === id);
    if (!block || block.status !== 'pending') return;
    const task = workspaceRef.current.tasks.find(item => taskRecordId(item) === block.taskId);
    if (!task || task.column === 'done') return;
    const now = new Date().toISOString();
    const started = { ...block, status: 'running', actualStart: Date.now(), updatedAt: now };
    const moved = { ...task, column: 'doing', completed: false, updatedAt: now };
    await commitScheduledWorkspace({ ...workspaceRef.current,
      schedules: workspaceRef.current.schedules.map(item => item.id === id ? started : item),
      tasks: workspaceRef.current.tasks.map(item => item.id === task.id ? moved : item),
    }, [scheduleToRecord(started), taskToRecord(moved)]);
  };

  const finishSchedule = async (id, completeTask = false) => {
    const block = workspaceRef.current.schedules.find(item => item.id === id);
    if (!block || block.status !== 'running') return;
    const task = workspaceRef.current.tasks.find(item => taskRecordId(item) === block.taskId);
    const time = Date.now();
    const finished = { ...block, status: 'finished', actualEnd: time, updatedAt: new Date(time).toISOString() };
    let blocks = workspaceRef.current.schedules.map(item => item.id === id ? finished : item);
    if (completeTask) blocks = cancelFutureBlocks(blocks, block.taskId, time);
    const moved = completeTask && task ? { ...task, column: 'done', completed: true, updatedAt: new Date(time).toISOString() } : null;
    await commitScheduledWorkspace({ ...workspaceRef.current, schedules: blocks,
      tasks: moved ? workspaceRef.current.tasks.map(item => item.id === task.id ? moved : item) : workspaceRef.current.tasks,
    }, [scheduleToRecord(finished), ...blocks.filter((item, index) => item !== workspaceRef.current.schedules[index] && item.id !== id).map(scheduleToRecord), ...(moved ? [taskToRecord(moved)] : [])]);
  };

  const addTask = (task) => {
    const column = task.column || 'inbox';
    const created = withColumn({
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...task,
      column,
      images: task.images || [],
      completed: column === 'done',
    });
    const nextTasks = [...workspaceRef.current.tasks, created];
    workspaceRef.current = { ...workspaceRef.current, tasks: nextTasks };
    setTasks(nextTasks);
    queueLocal(taskToRecord(created), created.images);
  };

  const updateTask = (id, updates) => {
    const current = workspaceRef.current.tasks.find(task => task.id === id);
    if (!current) return;
    const next = withColumn({ ...current, ...updates, updatedAt: new Date().toISOString() });
    const saved = { ...next, completed: next.column === 'done' };
    const nextTasks = workspaceRef.current.tasks.map(task => task.id === id ? saved : task);
    if (saved.column === 'done' && current.column !== 'done') {
      const blocks = cancelFutureBlocks(workspaceRef.current.schedules, taskRecordId(saved));
      void commitScheduledWorkspace({ ...workspaceRef.current, tasks: nextTasks, schedules: blocks }, [
        taskToRecord(saved), ...blocks.filter((block, index) => block !== workspaceRef.current.schedules[index]).map(scheduleToRecord),
      ]).catch(error => setStorageError(error.message));
      return;
    }
    workspaceRef.current = { ...workspaceRef.current, tasks: nextTasks };
    setTasks(nextTasks);
    queueLocal(taskToRecord(saved), saved.images);
  };

  const deleteTask = (id) => {
    const current = workspaceRef.current.tasks.find(task => task.id === id);
    if (!current) return;
    const deletedAt = Date.now();
    const tombstone = taskToRecord(current, { trashedAt: deletedAt, updatedAt: deletedAt, syncState: 'pending' });
    const nextTasks = workspaceRef.current.tasks.filter(task => task.id !== id);
    const removed = workspaceRef.current.schedules.filter(block => block.taskId === taskRecordId(current));
    const deletedRecords = [tombstone, ...removed.map(block => scheduleToRecord(block, { trashedAt: deletedAt, updatedAt: deletedAt }))];
    const deletedIds = new Set(deletedRecords.map(record => record.id));
    void commitScheduledWorkspace({ ...workspaceRef.current, tasks: nextTasks,
      schedules: workspaceRef.current.schedules.filter(block => block.taskId !== taskRecordId(current)),
      tombstones: [...workspaceRef.current.tombstones.filter(item => !deletedIds.has(item.id)), ...deletedRecords],
    }, deletedRecords).catch(error => setStorageError(error.message));
  };

  const toggleTask = (id) => {
    const current = workspaceRef.current.tasks.find(task => task.id === id);
    if (!current) return;
    const column = current.column === 'done' ? 'inbox' : 'done';
    updateTask(id, { column, completed: column === 'done' });
  };

  const moveTask = (id, column, beforeId) => {
    const current = workspaceRef.current.tasks.find(task => task.id === id);
    if (!current) return;
    const moved = withColumn({ ...current, column, completed: column === 'done', updatedAt: new Date().toISOString() });
    const nextTasks = insertTask(workspaceRef.current.tasks.filter(task => task.id !== id), moved, beforeId);
    if (column === 'done' && current.column !== 'done') {
      const blocks = cancelFutureBlocks(workspaceRef.current.schedules, taskRecordId(moved));
      void commitScheduledWorkspace({ ...workspaceRef.current, tasks: nextTasks, schedules: blocks }, [
        taskToRecord(moved), ...blocks.filter((block, index) => block !== workspaceRef.current.schedules[index]).map(scheduleToRecord),
      ]).catch(error => setStorageError(error.message));
      return;
    }
    workspaceRef.current = { ...workspaceRef.current, tasks: nextTasks };
    setTasks(nextTasks);
    queueLocal(taskToRecord(moved), moved.images);
  };

  const addNote = (note) => {
    const timestamp = new Date().toISOString();
    const created = { ...note, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp };
    const nextNotes = [...workspaceRef.current.notes, created];
    workspaceRef.current = { ...workspaceRef.current, notes: nextNotes };
    setNotes(nextNotes);
    queueLocal(noteToRecord(created));
    return created;
  };

  const updateNote = (id, updates) => {
    const current = workspaceRef.current.notes.find(note => note.id === id);
    if (!current) return;
    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
    const nextNotes = workspaceRef.current.notes.map(note => note.id === id ? updated : note);
    workspaceRef.current = { ...workspaceRef.current, notes: nextNotes };
    setNotes(nextNotes);
    queueLocal(noteToRecord(updated));
  };

  const deleteNote = (id) => {
    const current = workspaceRef.current.notes.find(note => note.id === id);
    if (!current) return;
    const deletedAt = Date.now();
    const tombstone = noteToRecord(current, { trashedAt: deletedAt, updatedAt: deletedAt, syncState: 'pending' });
    const nextNotes = workspaceRef.current.notes.filter(note => note.id !== id);
    const nextTombstones = [...workspaceRef.current.tombstones.filter(item => item.id !== tombstone.id), tombstone];
    workspaceRef.current = { ...workspaceRef.current, notes: nextNotes, tombstones: nextTombstones };
    setNotes(nextNotes);
    setTombstones(nextTombstones);
    queueLocal(tombstone);
  };

  const beginPairing = async name => {
    if (disconnecting.current) return;
    setSyncStatus('pairing');
    setSyncError('');
    try {
      setPairing(await createPairingSession(name.trim() || 'LinuxDo Desktop'));
    } catch (error) {
      setSyncStatus('unpaired');
      setSyncError(error.message || '无法创建配对请求。');
    }
  };

  const cancelPairing = () => { setPairing(undefined); setSyncStatus('unpaired'); setSyncError(''); };
  const approvePairing = async code => { await approvePairingCode(syncConfig, code); };
  const refreshDevices = async () => {
    if (!syncConfig) return [];
    const devices = await listDevices(syncConfig.deviceToken);
    setPairedDevices(devices);
    return devices;
  };
  const removeDevice = async deviceId => { await revokeDevice(syncConfig.deviceToken, deviceId); await refreshDevices(); };
  const disconnectSync = async () => {
    if (disconnecting.current) return;
    disconnecting.current = true;
    syncGeneration.current += 1;
    clearTimeout(syncTimer.current);
    setSyncStatus('disconnecting');
    setSyncError('');
    setPairing(undefined);
    try {
      await Promise.allSettled([syncTask.current, ...queueChains.current.values()]);
      clearTimeout(syncTimer.current);
      queueChains.current.clear();
      dirtySyncRevisions.current.clear();
      queuedSyncRevisions.current.clear();
      failedSyncRevisions.current.clear();
      await clearVault();
      const detached = detachWorkspace(workspaceRef.current);
      workspaceRef.current = detached;
      setTasks(detached.tasks);
      setNotes(detached.notes);
      setSchedules(detached.schedules);
      setDayGoals(detached.dayGoals);
      setTombstones([]);
      setSyncConfig(undefined);
      setPairedDevices([]);
      setSyncStatus('unpaired');
      setLastSyncedAt(0);
    } catch (error) {
      console.error('Failed to disconnect workspace sync:', error);
      setSyncStatus('error');
      setSyncError(error.message || '断开同步失败，请重试。');
    } finally {
      disconnecting.current = false;
    }
  };

  const value = {
    categories,
    activeCategory,
    setActiveCategory,
    tasks,
    notes,
    schedules,
    dayGoals,
    reminderOpen,
    setReminderOpen,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
    moveTask,
    addSchedule,
    updateSchedule,
    removeSchedule,
    setDayGoal,
    startSchedule,
    finishSchedule,
    addNote,
    updateNote,
    deleteNote,
    loading,
    storageError,
    storageReady,
    syncConfig,
    syncStatus,
    syncError,
    lastSyncedAt,
    pairing,
    pairedDevices,
    beginPairing,
    cancelPairing,
    approvePairing,
    refreshDevices,
    removeDevice,
    disconnectSync,
    syncNow: () => performSync(undefined, true),
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
