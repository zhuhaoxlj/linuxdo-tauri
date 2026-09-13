import React, { useMemo, useState } from 'react';
import { KANBAN_COLUMNS, useBoard } from '../context/BoardContext';
import KanbanColumn from '../components/KanbanColumn';

export default function BoardPage() {
  const {
    activeCategory,
    tasks,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    categories,
  } = useBoard();
  const [collapsed, setCollapsed] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [dropColumn, setDropColumn] = useState(null);

  const currentCategory = categories.find(category => category.id === activeCategory);
  const filteredTasks = useMemo(
    () => tasks.filter(task => task.category === activeCategory),
    [tasks, activeCategory],
  );

  if (activeCategory === 'linuxdo') return null;

  const onDragStart = (event, id) => {
    setDraggingId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };

  const finishDrop = (columnId, beforeId) => {
    if (draggingId) moveTask(draggingId, columnId, beforeId);
    setDraggingId(null);
    setDropColumn(null);
  };

  return (
    <div className="kanban-board">
      <div className="kanban-toolbar">
        <span className="kanban-toolbar-icon">{currentCategory?.icon}</span>
        <h1>{currentCategory?.name}</h1>
      </div>
      <div className="kanban-columns">
        {KANBAN_COLUMNS.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            cards={filteredTasks.filter(task => task.column === column.id)}
            collapsed={Boolean(collapsed[column.id])}
            onToggleCollapsed={() => setCollapsed(current => ({ ...current, [column.id]: !current[column.id] }))}
            onAdd={({ title, images }) => addTask({ title, images, category: activeCategory, column: column.id })}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onDragStart={onDragStart}
            isDropTarget={dropColumn === column.id}
            onDropOnColumn={{
              hover: setDropColumn,
              leave: id => setDropColumn(current => current === id ? null : current),
              drop: (event, id) => {
                event.preventDefault();
                finishDrop(id);
              },
            }}
            onDropOnCard={(event, beforeId) => {
              event.preventDefault();
              event.stopPropagation();
              const card = filteredTasks.find(task => task.id === beforeId);
              finishDrop(card?.column || column.id, beforeId);
            }}
          />
        ))}
      </div>
    </div>
  );
}
