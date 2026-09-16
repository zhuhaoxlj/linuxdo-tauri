import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Crosshair, Play, Target, Trash2, X } from 'lucide-react';
import { taskRecordId } from '../../sync/workspace';
import { addDays, conflictingIds, dayKey, daySegments, dayTimelineAxis, intervalMinutes, layoutSegments, snapToQuarter } from '../lib/schedule';

const formatClock = value => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const localInput = value => {
  const date = new Date(value);
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const gridTime = (key, minute) => {
  const date = new Date(dayTimelineAxis(key).start);
  date.setHours(0, minute, 0, 0);
  return date.getTime();
};

export default function DayTimeline({ date, setDate, tasks, categories, schedules, goals, draggingId, width,
  onAdd, onUpdate, onRemove, onStart, onFinish, onGoalChange, requestedTaskId, onRequestHandled, requestedBlockId, onBlockHandled }) {
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [draft, setDraft] = useState(null);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const suppressClick = useRef(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const axis = useMemo(() => dayTimelineAxis(date), [date, timeZone]);
  const taskMap = useMemo(() => new Map(tasks.map(task => [taskRecordId(task), task])), [tasks]);
  const segments = useMemo(() => daySegments(schedules, date), [schedules, date, timeZone]);
  const laidOut = useMemo(() => layoutSegments(segments), [segments]);
  const conflicts = useMemo(() => conflictingIds(segments), [segments]);
  const goal = goals.find(item => item.date === date && !item.conflictOf) || goals.find(item => item.date === date);
  const conflictingGoals = goals.filter(item => item.date === date && item.conflictOf);
  const planned = intervalMinutes(segments);
  const actual = intervalMinutes(schedules.filter(block => block.actualStart != null && block.actualEnd != null && block.actualEnd > block.actualStart)
    .map(block => ({ start: Math.max(axis.start, block.actualStart), end: Math.min(axis.end, block.actualEnd) }))
    .filter(segment => segment.end > segment.start));
  const canceled = schedules.filter(block => block.status === 'canceled' && block.plannedStart < axis.end && block.plannedEnd > axis.start);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    const current = dayKey() === date ? axis.top(Date.now()) : segments.length
      ? axis.top(segments[0].start) : axis.top(gridTime(date, 8 * 60));
    scrollRef.current.scrollTop = Math.max(0, current - 140);
  }, [date, timeZone]);

  useEffect(() => {
    if (!requestedTaskId) return;
    const start = dayKey() === date ? snapToQuarter(Date.now() + 15 * 60_000) : gridTime(date, 9 * 60);
    setEditor({ taskId: requestedTaskId, start: localInput(start), end: localInput(start + 60 * 60_000) });
    setError('');
    onRequestHandled();
  }, [requestedTaskId]);

  useEffect(() => {
    if (!requestedBlockId) return;
    const block = schedules.find(item => item.id === requestedBlockId);
    if (!block) return;
    setDate(dayKey(block.plannedStart));
    openBlock(block);
    onBlockHandled();
  }, [requestedBlockId, schedules]);

  const openBlock = block => {
    setEditor({ blockId: block.id, taskId: block.taskId, start: localInput(block.plannedStart), end: localInput(block.plannedEnd), originalStart: block.plannedStart, originalEnd: block.plannedEnd });
    setError('');
  };

  const report = async action => {
    try { await action(); setError(''); return true; }
    catch (cause) { setError(cause.message || '无法保存安排'); return false; }
  };

  const save = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const startValue = values.get('plannedStart');
    const endValue = values.get('plannedEnd');
    const start = editor.originalStart != null && startValue === localInput(editor.originalStart)
      ? editor.originalStart : new Date(startValue).getTime();
    const end = editor.originalEnd != null && endValue === localInput(editor.originalEnd)
      ? editor.originalEnd : new Date(endValue).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 15 * 60_000) {
      setError('结束时间至少比开始时间晚 15 分钟');
      return;
    }
    const success = await report(() => editor.blockId
      ? onUpdate(editor.blockId, { plannedStart: start, plannedEnd: end })
      : onAdd(editor.taskId, start, end - start));
    if (success) setEditor(null);
  };

  const changeGoal = async event => {
    event.preventDefault();
    const hours = new FormData(event.currentTarget).get('goalHours');
    const minutes = hours === '' ? null : Math.round(Number(hours) * 60);
    if (await report(() => onGoalChange(date, minutes))) setGoalOpen(false);
  };

  const drop = event => {
    event.preventDefault();
    setDragOver(false);
    const taskId = draggingId || event.dataTransfer.getData('text/plain');
    if (!tasks.some(task => task.id === taskId)) return;
    const rect = gridRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const minutes = Math.min((axis.end - axis.start) / 60_000 - 15, Math.round(fraction * (axis.end - axis.start) / (15 * 60_000)) * 15);
    void report(() => onAdd(taskId, axis.start + minutes * 60_000));
  };

  const startPointer = (event, block, edge) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = event.clientY;
    let changed = false;
    let next = { plannedStart: block.plannedStart, plannedEnd: block.plannedEnd };
    const move = current => {
      const delta = Math.round((current.clientY - origin) / 20) * 15 * 60_000;
      if (Math.abs(current.clientY - origin) < 5) return;
      changed = true;
      next = edge === 'end'
        ? { plannedStart: block.plannedStart, plannedEnd: Math.max(block.plannedStart + 15 * 60_000, block.plannedEnd + delta) }
        : { plannedStart: block.plannedStart + delta, plannedEnd: block.plannedEnd + delta };
      setDraft({ id: block.id, ...next });
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setDraft(null);
      if (changed) {
        suppressClick.current = true;
        void report(() => onUpdate(block.id, next));
        setTimeout(() => { suppressClick.current = false; }, 0);
      } else if (!edge) openBlock(block);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  return (
    <aside className="day-timeline" style={{ width }} aria-label="全天时间轴">
      <header className="day-timeline-header">
        <div className="day-timeline-heading"><CalendarDays size={16} /><strong>{new Date(axis.start).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</strong></div>
        <div className="day-timeline-nav">
          <button type="button" title="前一天" aria-label="前一天" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={17} /></button>
          <button type="button" title="回到今天" aria-label="回到今天" onClick={() => setDate(dayKey())}><Crosshair size={15} /></button>
          <button type="button" title="后一天" aria-label="后一天" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={17} /></button>
        </div>
      </header>
      <div className="day-timeline-summary">
        <button type="button" className={goal && planned > goal.minutes ? 'is-over-target' : ''} onClick={() => { setGoalInput(goal ? String(goal.minutes / 60) : ''); setGoalOpen(!goalOpen); }} title="设置当日目标">
          <Target size={14} />已安排 {formatDuration(planned)}{goal ? ` / ${formatDuration(goal.minutes)}` : ''}
        </button>
        <span className="day-timeline-actual">实际 {formatDuration(actual)}</span>
        {conflicts.size > 0 && <span className="day-timeline-conflict">{conflicts.size} 项冲突</span>}
      </div>
      {goalOpen && <form className="day-timeline-goal" onSubmit={changeGoal}>
        <label>当日目标（小时）<input name="goalHours" type="number" min="0.25" max="24" step="0.25" value={goalInput} onInput={event => setGoalInput(event.target.value)} placeholder="不设上限" /></label>
        <button type="submit">保存</button><button type="button" title="取消" aria-label="取消" onClick={() => setGoalOpen(false)}><X size={16} /></button>
      </form>}
      {conflictingGoals.length > 0 && <details className="day-timeline-goal-conflict"><summary>每日目标存在 {conflictingGoals.length} 个同步冲突副本</summary>
        {conflictingGoals.map(item => <div key={item.syncId}>{formatDuration(item.minutes)}</div>)}
      </details>}
      {error && <p className="day-timeline-error" role="alert">{error}</p>}
      <div className="day-timeline-scroll" ref={scrollRef}>
        <div ref={gridRef} className={`day-timeline-grid${dragOver ? ' is-drop-target' : ''}`} style={{ height: axis.height }}
          onDragOver={event => { if (draggingId) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragOver(true); } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false); }}
          onDrop={drop}>
          {axis.ticks.map(tick => <div key={tick.time} className="day-timeline-hour" style={{ top: tick.top }}><span title={tick.title}>{tick.label}</span></div>)}
          {dayKey(now) === date && <div className="day-timeline-now" style={{ top: axis.top(now) }} />}
          {laidOut.map(({ block, start, end, lane, lanes }) => {
            const task = taskMap.get(block.taskId);
            const current = draft?.id === block.id ? draft : block;
            const visibleStart = draft?.id === block.id ? Math.max(axis.start, current.plannedStart) : start;
            const visibleEnd = draft?.id === block.id ? Math.min(axis.end, current.plannedEnd) : end;
            const top = axis.top(visibleStart);
            const height = Math.max(18, axis.top(visibleEnd) - top);
            return <button key={block.id} type="button" className={`day-timeline-block${conflicts.has(block.id) || block.conflictOf ? ' is-conflict' : ''}${block.status === 'finished' ? ' is-finished' : ''}${block.status === 'running' ? ' is-running' : ''}${block.status === 'pending' && now > block.plannedEnd ? ' is-overdue' : ''}`}
              style={{ top, height, left: `calc(48px + (100% - 54px) * ${lane} / ${lanes})`, width: `calc((100% - 54px) / ${lanes} - 3px)` }}
              title={`${task?.title || '尚未同步的任务'} · ${formatClock(block.plannedStart)}–${formatClock(block.plannedEnd)}`}
              onPointerDown={event => startPointer(event, block)}
              onClick={() => { if (!suppressClick.current) openBlock(block); }}>
              <span className="day-timeline-block-time">{formatClock(block.plannedStart)}–{formatClock(block.plannedEnd)}</span>
              <strong>{task?.title || '尚未同步的任务'}</strong>
              {block.conflictOf && <small>同步冲突副本</small>}
              {task && <small>{categories.find(item => item.id === task.category)?.name || task.category}</small>}
              <span className="day-timeline-block-grip" onPointerDown={event => startPointer(event, block, 'end')} aria-hidden="true" />
            </button>;
          })}
        </div>
      </div>
      {canceled.length > 0 && <details className="day-timeline-history"><summary>已取消 {canceled.length}</summary>{canceled.map(block => <div key={block.id}>{taskMap.get(block.taskId)?.title || '未同步任务'} · {formatClock(block.plannedStart)}</div>)}</details>}
      {editor && <div className="day-timeline-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(null); }}>
        <form className="day-timeline-dialog" onSubmit={save} aria-label="安排时间">
          <header><h2>{editor.blockId ? '编辑安排' : '安排任务'}</h2><button type="button" title="关闭" aria-label="关闭" onClick={() => setEditor(null)}><X size={17} /></button></header>
          <p className="day-timeline-dialog-title">{(taskMap.get(editor.taskId) || tasks.find(task => task.id === editor.taskId))?.title || '尚未同步的任务'}</p>
          {schedules.find(block => block.id === editor.blockId)?.conflictOf && <p className="day-timeline-error">同步冲突副本，请核对这次安排。</p>}
          <label>开始<input name="plannedStart" type="datetime-local" required value={editor.start} onInput={event => setEditor(current => ({ ...current, start: event.target.value }))} /></label>
          <label>结束<input name="plannedEnd" type="datetime-local" required value={editor.end} onInput={event => setEditor(current => ({ ...current, end: event.target.value }))} /></label>
          {error && <p className="day-timeline-error" role="alert">{error}</p>}
          <div className="day-timeline-dialog-actions">
            {editor.blockId && <button type="button" className="danger" title="移除这次安排" onClick={async () => { if (await report(() => onRemove(editor.blockId))) setEditor(null); }}><Trash2 size={15} />移除</button>}
            <button type="submit" className="primary"><Clock3 size={15} />保存</button>
          </div>
          {editor.blockId && <div className="day-timeline-execution">
            {schedules.find(block => block.id === editor.blockId)?.status === 'pending' && <button type="button" onClick={async () => { if (await report(() => onStart(editor.blockId))) setEditor(null); }}><Play size={15} />开始</button>}
            {schedules.find(block => block.id === editor.blockId)?.status === 'running' && <><button type="button" onClick={async () => { if (await report(() => onFinish(editor.blockId, false))) setEditor(null); }}>结束本次</button><button type="button" onClick={async () => { if (await report(() => onFinish(editor.blockId, true))) setEditor(null); }}>完成任务</button></>}
          </div>}
        </form>
      </div>}
    </aside>
  );
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours && rest ? `${hours}h ${rest}m` : hours ? `${hours}h` : `${rest}m`;
}
