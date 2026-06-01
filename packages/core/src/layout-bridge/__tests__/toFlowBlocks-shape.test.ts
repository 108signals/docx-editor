/**
 * Integration test — inline shapes reach the painted layout.
 *
 * The editable ProseMirror view renders a `shape` node via its node view, but
 * the paginated painter pipeline had no `shape` branch in `paragraphToRuns`,
 * so inline shapes were silently dropped from the painted/measured layout —
 * the preview showed an empty gap where the geometry should be. The bridge now
 * converts a `shape` node into an inline SVG-image run so the painter draws it.
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { toFlowBlocks } from '../toFlowBlocks';
import type { ParagraphBlock, ImageRun } from '../../layout-engine/types';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: {
        styleId: { default: null },
        defaultTextFormatting: { default: null },
      },
    },
    text: { group: 'inline' },
    shape: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: {
        shapeType: { default: 'rect' },
        shapeId: { default: null },
        width: { default: 100 },
        height: { default: 80 },
        fillColor: { default: null },
        fillType: { default: null },
        gradientType: { default: null },
        gradientAngle: { default: null },
        gradientStops: { default: null },
        outlineWidth: { default: null },
        outlineColor: { default: null },
        outlineStyle: { default: null },
        transform: { default: null },
      },
    },
  },
});

function buildShapeDoc(attrs: Record<string, unknown>) {
  const shape = schema.node('shape', attrs);
  return schema.node('doc', null, [schema.node('paragraph', null, [shape])]);
}

function firstImageRun(blocks: unknown[]): ImageRun {
  const para = blocks.find((b) => (b as ParagraphBlock).kind === 'paragraph') as ParagraphBlock;
  const run = para.runs![0];
  expect(run.kind).toBe('image');
  return run as ImageRun;
}

describe('toFlowBlocks — inline shapes render in the painted layout', () => {
  test('a shape node becomes an inline SVG-image run (not dropped)', () => {
    const doc = buildShapeDoc({ shapeType: 'ellipse', width: 120, height: 60 });
    const blocks = toFlowBlocks(doc, {});
    const run = firstImageRun(blocks);
    expect(run.src.startsWith('data:image/svg+xml')).toBe(true);
    expect(run.width).toBe(120);
    expect(run.height).toBe(60);
    expect(run.alt).toBe('shape: ellipse');
  });

  test('the shape geometry and fill/outline reach the SVG markup', () => {
    const doc = buildShapeDoc({
      shapeType: 'ellipse',
      width: 120,
      height: 60,
      fillType: 'solid',
      fillColor: '#ff0000',
      outlineColor: '#0000ff',
      outlineWidth: 3,
    });
    const blocks = toFlowBlocks(doc, {});
    const run = firstImageRun(blocks);
    const svg = decodeURIComponent(run.src.replace(/^data:image\/svg\+xml;utf8,/, ''));
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('fill:#ff0000');
    expect(svg).toContain('stroke:#0000ff');
    expect(svg).toContain('stroke-width:3');
  });

  test('a shape run carries its ProseMirror span for hit-testing/selection', () => {
    const doc = buildShapeDoc({ shapeType: 'rect' });
    const blocks = toFlowBlocks(doc, {});
    const run = firstImageRun(blocks);
    expect(typeof run.pmStart).toBe('number');
    expect(typeof run.pmEnd).toBe('number');
    expect(run.pmEnd!).toBeGreaterThan(run.pmStart!);
  });
});
