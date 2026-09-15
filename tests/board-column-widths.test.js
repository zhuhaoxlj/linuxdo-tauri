import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseColumnWidths,
} from '../src/modules/board/lib/columnWidths.js';

test('column widths fall back to the default for empty or invalid storage', () => {
  assert.deepEqual(parseColumnWidths(null), {});
  assert.deepEqual(parseColumnWidths('not json'), {});
  assert.deepEqual(parseColumnWidths('[280]'), {});
  assert.deepEqual(parseColumnWidths(''), {});
});

test('stored widths are clamped into the usable range', () => {
  const widths = parseColumnWidths(JSON.stringify({
    inbox: 420,
    todo: MIN_COLUMN_WIDTH - 100,
    doing: MAX_COLUMN_WIDTH + 500,
    done: 'wide',
  }));
  assert.deepEqual(widths, {
    inbox: 420,
    todo: MIN_COLUMN_WIDTH,
    doing: MAX_COLUMN_WIDTH,
  });
});

test('widths for removed columns are dropped when the column list is known', () => {
  const columns = [{ id: 'inbox' }, { id: 'todo' }];
  const widths = parseColumnWidths({ inbox: 300, legacy: 300, todo: DEFAULT_COLUMN_WIDTH }, columns);
  assert.deepEqual(widths, { inbox: 300, todo: DEFAULT_COLUMN_WIDTH });
});
