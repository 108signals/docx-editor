/**
 * Comment + tracked-change ID allocation.
 *
 * Comments (`w:comment` ids) and tracked changes (`w:ins`/`w:del` revision ids)
 * share a single OOXML ID space — a duplicate ID between the two corrupts the
 * round-trip. Allocation is therefore one monotonic, no-reuse counter, exposed
 * as an **instance-scoped** factory rather than module-global state so two
 * editor instances on one page never share (or collide on) a counter.
 *
 * Kept separate from the comment/tracked-change transaction builders
 * (`commentOps.ts`) so the allocator can be owned independently — the editor
 * engine seeds and threads it without dragging in the PM-text-lookup graph.
 */

import type { EditorView } from 'prosemirror-view';
import type { Comment } from '../types/content';

/** Sentinel ID for a comment that hasn't been persisted yet (anchored to selection). */
export const PENDING_COMMENT_ID = -1;

export interface CommentIdAllocator {
  /** Allocate the next ID and advance the counter. */
  next(): number;
  /**
   * On document load, bump the counter above the highest ID found in the
   * loaded comments and tracked-change marks so subsequent allocations don't
   * collide with already-present IDs.
   */
  seedAbove(maxId: number): void;
}

/**
 * Create an instance-scoped monotonic comment/revision ID allocator. IDs are
 * never reused (deleting a comment does not free its ID), and the counter is
 * private to this allocator — multiple editors get independent ID spaces.
 *
 * @param base - Offset for the first allocated ID (`base + 1`). Pair with
 * `stride` to partition the ID space across collaborating peers so concurrent
 * allocations never collide — e.g. `ydoc.clientID * 1_000_000` with
 * `stride = 1_000_000`. Defaults to `0`, preserving the original `1, 2, 3, …`
 * sequence. These IDs are **in-memory only**: the OOXML schema types `w:id` as
 * unbounded `xsd:integer`, but Word reads it as signed int32, so the serializer
 * compacts to `1..N` on save when any ID exceeds `0x7FFFFFFF`
 * (`docx/serializer/decimalIdRemap.ts`).
 * @param stride - Width of this allocator's partition. `seedAbove` ignores IDs
 * outside `(base, base + stride]` so a peer's synced revision marks can't pull
 * this allocator into their partition. Defaults to `Infinity` (single editor:
 * every ID is in-partition).
 *
 * Collision-freedom across peers holds under two assumptions: (1) peers pass
 * distinct `base` values — with `clientID * stride` this means distinct Yjs
 * `clientID`s, which Yjs already relies on; and (2) a peer mints fewer than
 * `stride` IDs per session. `next()` warns (dev only) if it climbs past
 * `base + stride` into the neighbouring partition. Both hold comfortably for
 * realistic sessions (`stride = 1_000_000`).
 */
export function createCommentIdAllocator(base = 0, stride = Infinity): CommentIdAllocator {
  let nextId = base + 1;
  const ceiling = base + stride;
  let warned = false;
  return {
    next: () => {
      const id = nextId++;
      if (
        !warned &&
        id > ceiling &&
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV !== 'production'
      ) {
        warned = true;
        console.warn(
          `[docx-editor] commentIdAllocator overflowed its partition (base=${base}, stride=${stride}).`
        );
      }
      return id;
    },
    seedAbove(maxId: number) {
      if (maxId >= nextId && maxId <= ceiling) nextId = maxId + 1;
    },
  };
}

/**
 * Seed an allocator above every comment/revision ID currently in the document
 * — comment objects (including replies, which carry no mark) plus
 * tracked-change `revisionId` marks. Because `seedAbove` only ever raises the
 * counter, this is safe to call on load (React) or before each allocation
 * (Vue): new IDs never collide with or reuse an existing one, and the comment
 * and revision ID spaces stay unified.
 */
export function seedCommentAllocator(
  allocator: CommentIdAllocator,
  comments: Comment[] | undefined,
  view: EditorView | null
): void {
  // Seed per-ID (not via a single global max) so an out-of-partition ID — e.g.
  // a collab peer's synced revision mark — doesn't mask an in-partition one.
  for (const comment of comments ?? []) allocator.seedAbove(comment.id);
  view?.state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.attrs.revisionId != null) allocator.seedAbove(mark.attrs.revisionId as number);
    }
  });
}
