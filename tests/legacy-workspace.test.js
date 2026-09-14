import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyWorkspacePayload } from '../src/modules/board/lib/legacyWorkspace.js';

test('legacy workspace export excludes embedded images and unknown fields', () => {
  const payload = legacyWorkspacePayload([
    {
      id: 'card-1',
      title: 'Card',
      description: 'Body',
      images: [{ data: 'data:image/png;base64,secret' }],
      unknown: 'private',
    },
  ], [{ id: 'note-1', title: 'Note', content: 'Text', unknown: 'private' }]);

  assert.equal(payload.tasks[0].title, 'Card');
  assert.equal(payload.notes[0].content, 'Text');
  assert.equal('images' in payload.tasks[0], false);
  assert.equal('unknown' in payload.tasks[0], false);
  assert.equal('unknown' in payload.notes[0], false);
});
