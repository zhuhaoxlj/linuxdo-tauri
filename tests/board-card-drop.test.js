import assert from 'node:assert/strict';
import test from 'node:test';
import { cardDropPosition, cardDropTarget } from '../src/modules/board/lib/cardDrop.js';

const cards = [
  { id: 'a', category: 'home', column: 'todo' },
  { id: 'b', category: 'home', column: 'todo' },
  { id: 'c', category: 'home', column: 'todo' },
  { id: 'd', category: 'home', column: 'doing' },
  { id: 'e', category: 'home', column: 'doing' },
  { id: 'other', category: 'work', column: 'doing' },
];

test('card midpoint selects before or after', () => {
  assert.equal(cardDropPosition(119, { top: 100, height: 40 }), 'before');
  assert.equal(cardDropPosition(120, { top: 100, height: 40 }), 'after');
});

test('reordering upwards and downwards excludes the moving card from anchors', () => {
  assert.deepEqual(cardDropTarget(cards, 'c', 'a', 'before'), { column: 'todo', beforeId: 'a' });
  assert.deepEqual(cardDropTarget(cards, 'a', 'b', 'after'), { column: 'todo', beforeId: 'c' });
  assert.deepEqual(cardDropTarget(cards, 'b', 'c', 'after'), { column: 'todo', beforeId: undefined });
  assert.deepEqual(cardDropTarget(cards, 'b', 'a', 'after'), { column: 'todo', beforeId: 'c' });
});

test('cross-column drops support both sides and the final position', () => {
  assert.deepEqual(cardDropTarget(cards, 'a', 'd'), { column: 'doing', beforeId: 'd' });
  assert.deepEqual(cardDropTarget(cards, 'a', 'd', 'after'), { column: 'doing', beforeId: 'e' });
  assert.deepEqual(cardDropTarget(cards, 'a', 'e', 'after'), { column: 'doing', beforeId: undefined });
});

test('self drops and unknown cards are ignored', () => {
  assert.equal(cardDropTarget(cards, 'a', 'a'), null);
  assert.equal(cardDropTarget(cards, 'missing', 'a'), null);
  assert.equal(cardDropTarget(cards, 'a', 'missing'), null);
});

test('pinned cards retain separate ordering groups', () => {
  const pinned = [{ id: 'pin', category: 'home', column: 'doing', pinned: true }, ...cards];
  assert.deepEqual(cardDropTarget(pinned, 'a', 'pin'), { column: 'doing', beforeId: 'd' });
  assert.deepEqual(cardDropTarget(pinned, 'pin', 'd', 'after'), { column: 'doing', beforeId: undefined });
});
