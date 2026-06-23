import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import type { Document, Comment, Paragraph } from '../../types/document';
import { remapOversizedRevisionIds, MAX_DECIMAL_ID } from './decimalIdRemap';
import { serializeDocument } from './documentSerializer';
import { serializeComments } from './commentSerializer';
import { createDocx } from '../rezip';

// Typical collab ID: ydoc.clientID (~4e9) * 1_000_000 — far above signed int32.
const HUGE_A = 4_000_000_001_000_001;
const HUGE_B = 1_234_567_001_000_001;

function para(content: Paragraph['content']): Paragraph {
  return { type: 'paragraph', content };
}

function run(text: string) {
  return { type: 'run' as const, content: [{ type: 'text' as const, text }] };
}

function makeDoc(commentId: number, revisionId: number, replyId?: number): Document {
  const comments: Comment[] = [
    { id: commentId, author: 'A', content: [para([run('c')])] },
    ...(replyId != null
      ? [{ id: replyId, author: 'B', parentId: commentId, content: [para([run('r')])] }]
      : []),
  ];
  return {
    package: {
      document: {
        content: [
          para([
            { type: 'commentRangeStart', id: commentId },
            run('hello '),
            {
              type: 'insertion',
              info: { id: revisionId, author: 'A', date: '2025-01-01T00:00:00Z' },
              content: [run('world')],
            },
            { type: 'commentRangeEnd', id: commentId },
          ]),
        ],
        comments,
      },
    },
  };
}

/** Every `w:id="N"` in `xml` as a number. */
function emittedWIds(xml: string): number[] {
  return [...xml.matchAll(/w:id="(\d+)"/g)].map((m) => Number(m[1]));
}

describe('remapOversizedRevisionIds', () => {
  test('no-op when every ID already fits in signed int32', () => {
    const doc = makeDoc(3, 7);
    expect(remapOversizedRevisionIds(doc)).toBe(false);
    expect(doc.package.document.comments![0].id).toBe(3);
    const body = doc.package.document.content[0] as Paragraph;
    expect((body.content[0] as { id: number }).id).toBe(3);
  });

  test('remaps to dense 1..N preserving relative order across comments + revisions', () => {
    const doc = makeDoc(HUGE_A, HUGE_B, HUGE_A + 1);
    expect(remapOversizedRevisionIds(doc)).toBe(true);

    // Single shared sequence, sorted: HUGE_B → 1, HUGE_A → 2, HUGE_A+1 → 3.
    const [comment, reply] = doc.package.document.comments!;
    expect(comment.id).toBe(2);
    expect(reply.id).toBe(3);
    expect(reply.parentId).toBe(2);

    const body = doc.package.document.content[0] as Paragraph;
    expect(body.content[0]).toEqual({ type: 'commentRangeStart', id: 2 });
    expect(body.content[3]).toEqual({ type: 'commentRangeEnd', id: 2 });
    expect((body.content[2] as { info: { id: number } }).info.id).toBe(1);
  });

  test('idempotent — second call is a no-op', () => {
    const doc = makeDoc(HUGE_A, HUGE_B);
    expect(remapOversizedRevisionIds(doc)).toBe(true);
    expect(remapOversizedRevisionIds(doc)).toBe(false);
  });

  test('does not mutate the live comment objects (shared with sidebar / collab Y.Array)', () => {
    const doc = makeDoc(HUGE_A, HUGE_B, HUGE_A + 1);
    // Hold references the way the editor and the collab Y.Array do — the same
    // array and objects that the sidebar renders from.
    const liveArray = doc.package.document.comments!;
    const [liveComment, liveReply] = liveArray;

    expect(remapOversizedRevisionIds(doc)).toBe(true);

    // The live objects keep their original (partitioned) IDs, so they stay in
    // sync with the unchanged PM comment marks and with peers.
    expect(liveComment.id).toBe(HUGE_A);
    expect(liveReply.id).toBe(HUGE_A + 1);
    expect(liveReply.parentId).toBe(HUGE_A);
    // The renumber happened on a detached snapshot, not the live array.
    expect(doc.package.document.comments).not.toBe(liveArray);
    expect(doc.package.document.comments![0]).not.toBe(liveComment);
  });

  test('descends into tables and pPr-level tracked changes', () => {
    const doc: Document = {
      package: {
        document: {
          content: [
            {
              type: 'table',
              rows: [
                {
                  type: 'tableRow',
                  structuralChange: {
                    type: 'tableRowInsertion',
                    info: { id: HUGE_A, author: 'A' },
                  },
                  cells: [
                    {
                      type: 'tableCell',
                      content: [
                        { ...para([run('x')]), pPrIns: { id: HUGE_B, author: 'A' } } as Paragraph,
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    };
    expect(remapOversizedRevisionIds(doc)).toBe(true);
    for (const id of emittedWIds(serializeDocument(doc))) {
      expect(id).toBeLessThanOrEqual(MAX_DECIMAL_ID);
    }
  });
});

describe('Word int32 w:id invariant (PR #956 review)', () => {
  // This is the test that would have caught the original PR's bug without
  // knowing the implementation: it asserts the SERIALIZED OUTPUT obeys Word's
  // signed-int32 cap on every `w:id`, regardless of how big the in-memory IDs
  // are. The schema says `ST_DecimalNumber` is unbounded `xsd:integer`; Word
  // does not honour that, so neither can we.
  test('createDocx never emits a w:id above 0x7FFFFFFF in document.xml or comments.xml', async () => {
    const doc = makeDoc(HUGE_A, HUGE_B, HUGE_A + 1);
    const buf = await createDocx(doc);
    const zip = await JSZip.loadAsync(buf);

    const documentXml = await zip.file('word/document.xml')!.async('text');
    const commentsXml = await zip.file('word/comments.xml')!.async('text');

    const all = [...emittedWIds(documentXml), ...emittedWIds(commentsXml)];
    expect(all.length).toBeGreaterThan(0);
    for (const id of all) {
      expect(id).toBeLessThanOrEqual(MAX_DECIMAL_ID);
    }

    // Referential integrity survives the remap: the comment's range markers in
    // document.xml still point at the comment's id in comments.xml.
    const commentIdMatch = commentsXml.match(/<w:comment w:id="(\d+)"/);
    expect(commentIdMatch).not.toBeNull();
    expect(documentXml).toContain(`<w:commentRangeStart w:id="${commentIdMatch![1]}"`);
  });

  test('serializer-level invariant holds for the body alone', () => {
    const doc = makeDoc(HUGE_A, HUGE_B);
    remapOversizedRevisionIds(doc);
    for (const id of emittedWIds(serializeDocument(doc))) {
      expect(id).toBeLessThanOrEqual(MAX_DECIMAL_ID);
    }
    for (const id of emittedWIds(serializeComments(doc.package.document.comments!))) {
      expect(id).toBeLessThanOrEqual(MAX_DECIMAL_ID);
    }
  });
});
