/**
 * Geometry shapes — non-text-box wps:wsp drawings (a:prstGeom) must survive
 * import. Before the blockContentParser wiring, parseImage returned null for
 * these drawings and they were silently dropped; only text boxes survived.
 *
 * These tests cover the import path (preset geometry, size, fill, outline are
 * preserved) and the serialize path (the shape round-trips back to a wps:wsp
 * carrying the original preset name).
 */

import { describe, expect, test } from 'bun:test';
import { parseDocumentBody } from '../documentParser';
import { serializeParagraph } from '../serializer/paragraphSerializer';
import type { ShapeContent } from '../../types/document';

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';

/** An inline wps:wsp geometry shape (no text box) with the given preset. */
function buildDocumentWithGeometryShape(prst: string): string {
  return `
    <w:document ${NS}>
      <w:body>
        <w:p>
          <w:r>
            <w:drawing>
              <wp:inline>
                <wp:extent cx="914400" cy="685800"/>
                <wp:docPr id="7" name="${prst} 7"/>
                <a:graphic>
                  <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                    <wps:wsp>
                      <wps:cNvPr id="7" name="${prst} 7"/>
                      <wps:spPr>
                        <a:xfrm>
                          <a:off x="0" y="0"/>
                          <a:ext cx="914400" cy="685800"/>
                        </a:xfrm>
                        <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>
                        <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
                        <a:ln w="12700"><a:solidFill><a:srgbClr val="003366"/></a:solidFill></a:ln>
                      </wps:spPr>
                      <wps:bodyPr/>
                    </wps:wsp>
                  </a:graphicData>
                </a:graphic>
              </wp:inline>
            </w:drawing>
          </w:r>
          <w:r><w:t>Caption.</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;
}

function extractShapes(prst: string): ShapeContent[] {
  const body = parseDocumentBody(buildDocumentWithGeometryShape(prst));
  expect(body.content).toHaveLength(1);
  const paragraph = body.content[0];
  if (paragraph.type !== 'paragraph') throw new Error('expected paragraph');
  return paragraph.content.flatMap((c) =>
    c.type === 'run' ? c.content.filter((rc): rc is ShapeContent => rc.type === 'shape') : []
  );
}

describe('geometry shape import — non-text-box wps:wsp', () => {
  test('a five-point star is no longer dropped on import', () => {
    const shapes = extractShapes('star5');
    expect(shapes).toHaveLength(1);
    expect(shapes[0].shape.shapeType).toBe('star5');
  });

  test('preset geometry, size, fill and outline are preserved', () => {
    const shapes = extractShapes('rightArrow');
    expect(shapes).toHaveLength(1);
    const { shape } = shapes[0];

    expect(shape.shapeType).toBe('rightArrow');
    expect(shape.size).toEqual({ width: 914400, height: 685800 });
    expect(shape.fill).toBeDefined();
    expect(shape.outline).toBeDefined();
    // A geometry-only shape carries no text body.
    expect(shape.textBody).toBeUndefined();
  });
});

describe('geometry shape round-trip — parse → serialize', () => {
  test('the preset name survives serialization back to wps:wsp', () => {
    const body = parseDocumentBody(buildDocumentWithGeometryShape('hexagon'));
    const paragraph = body.content[0];
    if (paragraph.type !== 'paragraph') throw new Error('expected paragraph');

    const xml = serializeParagraph(paragraph as never);

    expect(xml).toContain('wps:wsp');
    expect(xml).toContain('prst="hexagon"');
  });
});
