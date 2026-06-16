/**
 * Issue #813 — anchored shapes (e.g. an `inFront` title box) rendered inline
 * and overlapped the body text because `convertShape` never propagated the
 * shape's wrap/anchor into the `displayMode`/`position` node attrs. They now
 * carry the same float layout attrs as anchored images, so the painter
 * positions them out of flow via the floating layer.
 *
 * Background: https://github.com/eigenpal/docx-editor/issues/813
 */

import { describe, expect, test } from 'bun:test';
import type { Node as PMNode } from 'prosemirror-model';
import { toProseDoc } from '../toProseDoc';
import type { Document, Shape, Paragraph } from '../../../types/document';

function makeDocument(shape: Shape): Document {
  const paragraph: Paragraph = {
    type: 'paragraph',
    content: [
      { type: 'run', content: [{ type: 'shape', shape }] },
      { type: 'run', content: [{ type: 'text', text: 'Body text under the shape.' }] },
    ],
  };
  return { package: { document: { content: [paragraph] } } } as unknown as Document;
}

function findShapeNode(doc: PMNode): PMNode {
  let found: PMNode | null = null;
  doc.descendants((node) => {
    if (node.type.name === 'shape') {
      found = node;
      return false;
    }
    return true;
  });
  if (!found) throw new Error('no shape node');
  return found;
}

const anchoredRect: Shape = {
  type: 'shape',
  shapeType: 'rect',
  size: { width: 1828800, height: 914400 },
  wrap: { type: 'inFront' },
  position: {
    horizontal: { relativeTo: 'page', posOffset: 914400 },
    vertical: { relativeTo: 'page', posOffset: 914400 },
  },
};

const inlineRect: Shape = {
  type: 'shape',
  shapeType: 'line',
  size: { width: 5943600, height: 9525 },
  wrap: { type: 'inline' },
};

describe('issue #813 — anchored shape positioning', () => {
  test('an inFront anchored shape becomes a positioned float', () => {
    const node = findShapeNode(toProseDoc(makeDocument(anchoredRect)));
    expect(node.attrs.displayMode).toBe('float');
    expect(node.attrs.position).not.toBeNull();
    expect(node.attrs.position.horizontal.posOffset).toBe(914400);
    expect(node.attrs.position.horizontal.relativeTo).toBe('page');
  });

  test('an inline shape stays inline (e.g. the #811 horizontal rule)', () => {
    const node = findShapeNode(toProseDoc(makeDocument(inlineRect)));
    expect(node.attrs.displayMode).toBe('inline');
    expect(node.attrs.position).toBeNull();
  });
});
