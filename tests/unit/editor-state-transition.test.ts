import { describe, expect, it } from 'vitest';

import { canTransitionEditorState } from '../../src/core/editor-state-transition.js';

import type { EditorState } from '../../src/core/editor-state.js';

describe('editor lifecycle transitions', () => {
  it.each(['create', 'edit', 'batchEdit', 'remove'] as const)(
    'preserves the %s action throughout dialog transitions',
    (action) => {
      const transitions: readonly (readonly [EditorState, EditorState])[] = [
        [{ status: 'ready' }, { status: 'opening', action }],
        [{ status: 'opening', action }, { status: 'ready' }],
        [
          { status: 'opening', action },
          { status: 'open', action },
        ],
        [
          { status: 'open', action },
          { status: 'open', action },
        ],
        [
          { status: 'open', action },
          { status: 'submitting', action },
        ],
        [
          { status: 'submitting', action },
          { status: 'open', action },
        ],
        [
          { status: 'submitting', action },
          { status: 'closing', action },
        ],
        [
          { status: 'open', action },
          { status: 'closing', action },
        ],
        [{ status: 'closing', action }, { status: 'ready' }],
      ];
      for (const [current, next] of transitions) {
        expect(canTransitionEditorState(current, next)).toBe(true);
        expect(canTransitionEditorState(current, { status: 'destroyed' })).toBe(true);
        expect(canTransitionEditorState({ status: 'destroyed' }, current)).toBe(false);
      }
      for (const other of ['create', 'edit', 'batchEdit', 'remove'] as const) {
        if (other !== action) {
          expect(
            canTransitionEditorState(
              { status: 'open', action },
              { status: 'open', action: other },
            ),
          ).toBe(false);
        }
      }
      expect(
        canTransitionEditorState(
          { status: 'opening', action },
          { status: 'closing', action },
        ),
      ).toBe(false);
    },
  );
});
