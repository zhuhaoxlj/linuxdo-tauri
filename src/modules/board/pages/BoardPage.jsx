import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { KANBAN_COLUMNS, useBoard } from '../context/BoardContext';
import { taskBoardCategories } from '../lib/categories';
import KanbanColumn from '../components/KanbanColumn';
import { sortPinnedTasks } from '../lib/tasks';
import { cardDropPosition, cardDropTarget } from '../lib/cardDrop';
import { useCardPointerDrag } from '../lib/useCardPointerDrag';
import { useColumnWidths } from '../lib/useColumnWidths';
import { DEFAULT_COLUMN_WIDTH } from '../lib/columnWidths';
import { taskRecordId } from '../../sync/workspace';
import { dayKey } from '../lib/schedule';
import { writeSharedValue } from '../../../shared/sharedStorage';
import DayTimeline from '../components/DayTimeline';

const VIEW_KEY = 'fluxdo:board-view';
const TIMELINE_WIDTH_KEY = 'fluxdo:timeline-width';

function initialView() {
  try { return localStorage.getItem(VIEW_KEY) === 'today' ? 'today' : 'board'; }
  catch { return 'board'; }
}

function initialWidth() {
  try { return Math.max(280, Math.min(480, Number(localStorage.getItem(TIMELINE_WIDTH_KEY)) || 360)); }
  catch { return 360; }
}

export default function BoardPage() {
  const {
    activeCategory,
    tasks,
    schedules,
    dayGoals,
    storageError,
    reminderOpen,
    setReminderOpen,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    addSchedule,
    updateSchedule,
    removeSchedule,
    setDayGoal,
    startSchedule,
    finishSchedule,
    categories,
  } = useBoard();
  const [collapsed, setCollapsed] = useState({});
  const { widths, resize, commit } = useColumnWidths();
  const [draggingId, setDraggingId] = useState(null);
  const [dropColumn, setDropColumn] = useState(null);
  const [dropCard, setDropCard] = useState(null);
  const [pointerDrop, setPointerDrop] = useState(null);
  const [pointerOverTimeline, setPointerOverTimeline] = useState(false);
  const [view, setView] = useState(initialView);
  const [selectedDate, setSelectedDate] = useState(dayKey);
  const [timelineWidth, setTimelineWidth] = useState(initialWidth);
  const [requestedTaskId, setRequestedTaskId] = useState(null);
  const [boardError, setBoardError] = useState('');
  const [reminderStatus, setReminderStatus] = useState(null);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return undefined;
    let mounted = true;
    const check = () => invoke('reminder_status').then(status => { if (mounted) setReminderStatus(status); })
      .catch(error => { if (mounted) setReminderStatus({ trayReady: false, lastError: String(error) }); });
    void check();
    const timer = setInterval(check, 10_000);
    const listener = listen('tray-unavailable', () => void check());
    return () => { mounted = false; clearInterval(timer); void listener.then(dispose => dispose()); };
  }, []);

  useEffect(() => {
    if (reminderOpen) setView('today');
  }, [reminderOpen]);

  const currentCategory = categories.find(category => category.id === activeCategory);
  const moveTargets = useMemo(() => taskBoardCategories(categories, activeCategory), [categories, activeCategory]);
  const filteredTasks = useMemo(
    () => sortPinnedTasks(tasks.filter(task => task.category === activeCategory)),
    [tasks, activeCategory],
  );
  const scheduledByTask = useMemo(() => {
    const grouped = new Map();
    for (const block of schedules) {
      if (block.status === 'canceled') continue;
      const current = grouped.get(block.taskId) || [];
      current.push(block);
      grouped.set(block.taskId, current);
    }
    for (const blocks of grouped.values()) blocks.sort((a, b) => a.plannedStart - b.plannedStart);
    return grouped;
  }, [schedules]);

  const clearDrag = () => {
    setDraggingId(null);
    setDropColumn(null);
    setDropCard(null);
    setPointerOverTimeline(false);
  };

  const pointerTarget = (id, node, clientY) => {
    if (node?.closest('.day-timeline-grid')) return { timeline: true };
    const section = node?.closest('[data-column-id]');
    if (!section) return null;
    const cardNode = node.closest('[data-task-id]');
    if (!cardNode) return { column: section.dataset.columnId };
    const card = filteredTasks.find(task => String(task.id) === cardNode.dataset.taskId);
    const position = cardDropPosition(clientY, cardNode.getBoundingClientRect());
    const target = cardDropTarget(filteredTasks, id, card?.id, position);
    return target ? { ...target, cardId: card.id, position } : null;
  };

  const pointerDrag = useCardPointerDrag({
    onStart: setDraggingId,
    onHover: (id, node, clientY) => {
      const target = pointerTarget(id, node, clientY);
      setDropColumn(target?.column || null);
      setDropCard(target?.cardId != null ? { id: target.cardId, position: target.position } : null);
      setPointerOverTimeline(Boolean(target?.timeline));
    },
    onDrop: (id, node, clientY) => {
      const target = pointerTarget(id, node, clientY);
      if (target?.timeline) setPointerDrop({ taskId: id, clientY });
      else if (target) void moveTask(id, target.column, target.beforeId);
    },
    onEnd: clearDrag,
  });

  if (activeCategory === 'linuxdo') return null;

  const changeView = next => {
    setView(next);
    try { writeSharedValue(VIEW_KEY, next); }
    catch (error) { setBoardError(error.message || '无法保存显示模式'); }
  };

  const resizeTimeline = event => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = timelineWidth;
    let currentWidth = startWidth;
    const move = next => {
      currentWidth = Math.max(280, Math.min(480, startWidth + startX - next.clientX));
      setTimelineWidth(currentWidth);
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      try { writeSharedValue(TIMELINE_WIDTH_KEY, String(currentWidth)); }
      catch (error) { setBoardError(error.message || '无法保存时间轴宽度'); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  return (
    <div className="kanban-board">
      <div className="kanban-toolbar">
        <span className="kanban-toolbar-icon">{currentCategory?.icon}</span>
        <h1>{currentCategory?.name}</h1>
        <div className="kanban-view-switch" role="group" aria-label="看板视图">
          <button type="button" className={view === 'board' ? 'active' : ''} aria-pressed={view === 'board'} onClick={() => changeView('board')}>看板</button>
          <button type="button" className={view === 'today' ? 'active' : ''} aria-pressed={view === 'today'} onClick={() => changeView('today')}>今日</button>
        </div>
      </div>
      {boardError && <p className="kanban-board-error" role="alert">{boardError}</p>}
      {storageError && <p className="kanban-board-error" role="alert">{storageError}</p>}
      {reminderStatus && (!reminderStatus.trayReady || reminderStatus.lastError) && <p className="kanban-board-error" role="status">
        {reminderStatus.lastError || '系统托盘不可用，请保持窗口打开。'} 后台提醒未就绪，请检查桌面通知服务与系统通知权限。
      </p>}
      <div className="kanban-board-body">
      <div className="kanban-columns">
        {KANBAN_COLUMNS.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            cards={filteredTasks.filter(task => task.column === column.id)}
            width={widths[column.id] || DEFAULT_COLUMN_WIDTH}
            collapsed={Boolean(collapsed[column.id])}
            onResize={next => resize(column.id, next)}
            onResizeCommit={commit}
            onToggleCollapsed={() => setCollapsed(current => ({ ...current, [column.id]: !current[column.id] }))}
            onAdd={({ title, images }) => addTask({ title, images, category: activeCategory, column: column.id })}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onPointerDragStart={pointerDrag.onPointerDown}
            onDragClickCapture={pointerDrag.onClickCapture}
            draggingId={draggingId}
            dropCard={dropCard}
            scheduledByTask={scheduledByTask}
            onSchedule={taskId => { setRequestedTaskId(taskId); changeView('today'); }}
            isDropTarget={dropColumn === column.id}
            moveTargets={moveTargets}
          />
        ))}
      </div>
      {view === 'today' && <>
        <div className="day-timeline-resizer" role="separator" aria-label="调整时间轴宽度" tabIndex={0}
          onPointerDown={resizeTimeline} onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = Math.max(280, Math.min(480, timelineWidth + (event.key === 'ArrowLeft' ? 16 : -16)));
            setTimelineWidth(next);
            try { writeSharedValue(TIMELINE_WIDTH_KEY, String(next)); } catch (error) { setBoardError(error.message || '无法保存时间轴宽度'); }
          }} />
        <DayTimeline date={selectedDate} setDate={setSelectedDate} tasks={tasks} categories={categories} schedules={schedules} goals={dayGoals}
          draggingId={draggingId} pointerDrop={pointerDrop} pointerOver={pointerOverTimeline}
          onPointerDropHandled={() => setPointerDrop(null)} width={timelineWidth} onAdd={async (...args) => { await addSchedule(...args); setDraggingId(null); }}
          onUpdate={updateSchedule} onRemove={removeSchedule} onStart={startSchedule} onFinish={finishSchedule} onGoalChange={setDayGoal}
          requestedTaskId={requestedTaskId} onRequestHandled={() => setRequestedTaskId(null)}
          requestedBlockId={reminderOpen} onBlockHandled={() => setReminderOpen(null)} />
      </>}
      </div>
      {pointerDrag.preview && createPortal(
        <div className="kanban-drag-preview" aria-hidden="true" style={{
          width: pointerDrag.preview.width,
          left: pointerDrag.preview.x,
          top: pointerDrag.preview.y,
        }}>
          {pointerDrag.preview.task.title || '图片卡片'}
        </div>, document.body,
      )}
    </div>
  );
}
