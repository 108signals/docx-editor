/**
 * The instance-scoped comment/revision ID allocator and its seed helper.
 * Pins the canonical (React) monotonic-no-reuse scheme, per-instance isolation,
 * and the seed-above-max-of-(comments + revision marks) behavior.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { singletonManager } from '../schema';
import {
  createCommentIdAllocator,
  seedCommentAllocator,
  PENDING_COMMENT_ID,
} from '../commentIdAllocator';
import { applyProposedChange } from '../commentOps';
import type { Comment } from '../../types/content';

const schema = singletonManager.getSchema();

function para(paraId: string, text: string) {
  return schema.nodes.paragraph.create({ paraId }, schema.text(text));
}

function makeView(...paras: ReturnType<typeof para>[]) {
  const doc = schema.nodes.doc.create(null, paras);
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView & { state: EditorState };
}

describe('createCommentIdAllocator', () => {
  test('is monotonic and does not reuse IDs after a delete', () => {
    const a = createCommentIdAllocator();
    expect(a.next()).toBe(1);
    expect(a.next()).toBe(2);
    expect(a.next()).toBe(3);
    // Simulate deleting comment 3, then adding again — must NOT reuse 3.
    a.seedAbove(2);
    expect(a.next()).toBe(4);
  });

  test('two allocators are independent (per-instance isolation)', () => {
    const a = createCommentIdAllocator();
    const b = createCommentIdAllocator();
    expect(a.next()).toBe(1);
    expect(a.next()).toBe(2);
    expect(b.next()).toBe(1);
  });

  test('seedAbove raises the counter above existing IDs, never lowers', () => {
    const a = createCommentIdAllocator();
    a.seedAbove(10);
    expect(a.next()).toBe(11);
    a.seedAbove(5); // lower than current — no-op
    expect(a.next()).toBe(12);
  });

  test('PENDING_COMMENT_ID sentinel is negative', () => {
    expect(PENDING_COMMENT_ID).toBe(-1);
  });
});

describe('createCommentIdAllocator(base) — collab partitioning (#257)', () => {
  test('default base (0) preserves the original 1,2,3 sequence', () => {
    const implicit = createCommentIdAllocator();
    const explicit = createCommentIdAllocator(0);
    expect(implicit.next()).toBe(1);
    expect(explicit.next()).toBe(1);
    expect(implicit.next()).toBe(2);
    expect(explicit.next()).toBe(2);
  });

  test('two peers with disjoint bases never collide across many allocations', () => {
    const peerA = createCommentIdAllocator(0);
    const peerB = createCommentIdAllocator(1_000_000);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const a = peerA.next();
      const b = peerB.next();
      expect(seen.has(a)).toBe(false);
      expect(seen.has(b)).toBe(false);
      seen.add(a);
      seen.add(b);
    }
    expect(seen.size).toBe(200);
  });

  test('seedAbove below base is a no-op (counter never lowered)', () => {
    const a = createCommentIdAllocator(1_000_000);
    a.seedAbove(50); // a peer's loaded doc has IDs up to 50 — must not pull us down
    expect(a.next()).toBe(1_000_001);
  });

  test('seedAbove with an in-partition ID raises past it', () => {
    const a = createCommentIdAllocator(1_000_000, 1_000_000);
    a.seedAbove(1_000_500);
    expect(a.next()).toBe(1_000_501);
  });

  test('seedAbove ignores out-of-partition IDs (synced peer revision marks)', () => {
    // Greptile P1 repro: peer A (base 5M) mints revisionId 5_000_001, Yjs
    // syncs it into peer B's PM state, B re-seeds before its next comment.
    // Without the stride clamp B would jump to 5_000_002 and collide with A.
    const b = createCommentIdAllocator(1_000_000, 1_000_000);
    b.seedAbove(5_000_001);
    expect(b.next()).toBe(1_000_001);
  });

  test('default stride (Infinity) treats every ID as in-partition', () => {
    const a = createCommentIdAllocator(1_000_000);
    a.seedAbove(9_000_000);
    expect(a.next()).toBe(9_000_001);
  });
});

describe('seedCommentAllocator', () => {
  test('seeds above the max of comment IDs and revision marks', () => {
    const view = makeView(para('AAA', 'hello world'));
    const setup = createCommentIdAllocator();
    setup.seedAbove(40); // next revisionId will be 41
    applyProposedChange(
      view,
      { paraId: 'AAA', search: 'world', replaceWith: '', author: 'Al' },
      setup
    );

    const comments: Comment[] = [{ id: 7, author: 'x', date: '', content: [] }];
    const a = createCommentIdAllocator();
    seedCommentAllocator(a, comments, view);
    // max(comment id 7, revision id 41) = 41 → next is 42.
    expect(a.next()).toBe(42);
  });

  test('no comments and no marks leaves the allocator at 1', () => {
    const view = makeView(para('AAA', 'plain'));
    const a = createCommentIdAllocator();
    seedCommentAllocator(a, [], view);
    expect(a.next()).toBe(1);
  });

  test('null view seeds from comments only', () => {
    const a = createCommentIdAllocator();
    seedCommentAllocator(a, [{ id: 9, author: 'x', date: '', content: [] }], null);
    expect(a.next()).toBe(10);
  });

  test('out-of-partition revision marks in view do not pull a strided allocator across', () => {
    const view = makeView(para('AAA', 'hello world'));
    const peerA = createCommentIdAllocator(5_000_000);
    applyProposedChange(
      view,
      { paraId: 'AAA', search: 'world', replaceWith: '', author: 'A' },
      peerA
    );
    const peerB = createCommentIdAllocator(1_000_000, 1_000_000);
    seedCommentAllocator(peerB, [], view);
    expect(peerB.next()).toBe(1_000_001);
  });
});
