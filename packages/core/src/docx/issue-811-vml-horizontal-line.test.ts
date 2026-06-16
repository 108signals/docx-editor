/**
 * Issue #811 — drawn VML shapes (no `<v:imagedata>`) were dropped on import.
 *
 * Word's "Horizontal Line" (Insert > Horizontal Line) is a stroke-only
 * `<v:rect style="width:468pt;height:.05pt" filled="f">` inside a `<w:pict>`.
 * `parseVmlImageContent` returns null for it (no image data), so it used to
 * vanish. `parseVmlShapeContent` now turns it into a `line` Shape so the
 * geometry pipeline renders a full-width rule, matching Word.
 *
 * Background: https://github.com/eigenpal/docx-editor/issues/811
 */

import { describe, expect, test } from 'bun:test';
import { parseXml, findAllDeep, type XmlElement } from './xmlParser';
import { parseVmlShapeContent } from './vmlShapeParser';

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml" ' +
  'xmlns:o="urn:schemas-microsoft-com:office:office"';

// The exact shape Word emits for Insert > Horizontal Line (from Format_test.docx).
const HORIZONTAL_LINE = `<w:r ${NS}><w:pict>
  <v:rect id="Horizontal Line 1" style="width:468pt;height:.05pt;mso-left-percent:-10001" filled="f">
    <w10:anchorlock/>
  </v:rect>
</w:pict></w:r>`;

const FILLED_RECT = `<w:r ${NS}><w:pict>
  <v:rect id="Box 1" style="width:100pt;height:60pt" fillcolor="#ff0000" strokecolor="#0000ff" strokeweight="2pt"/>
</w:pict></w:r>`;

const IMAGE_PICT = `<w:r ${NS}
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:pict>
  <v:rect id="Img" style="width:120pt;height:40pt"><v:imagedata r:id="rId7"/></v:rect>
</w:pict></w:r>`;

function pictOf(xml: string): XmlElement {
  const root = parseXml(xml);
  const pict = findAllDeep(root, 'w', 'pict')[0];
  if (!pict) throw new Error('no pict element');
  return pict;
}

describe('issue #811 — VML drawn shapes', () => {
  test('Word "Horizontal Line" v:rect becomes a full-width line shape', () => {
    const content = parseVmlShapeContent(pictOf(HORIZONTAL_LINE));
    expect(content).not.toBeNull();
    expect(content!.type).toBe('shape');
    const shape = content!.shape;
    // Hairline, filled="f" rect → rendered as a `line` so the SVG draws a rule.
    expect(shape.shapeType).toBe('line');
    // 468pt = 468 * 12700 EMU.
    expect(shape.size.width).toBe(468 * 12700);
    // No fill (filled="f"), default black stroke.
    expect(shape.fill?.type ?? 'none').toBe('none');
    expect(shape.outline?.color?.rgb).toBe('000000');
    // Non-zero box height so the SVG viewport renders the stroke.
    expect(shape.size.height).toBeGreaterThan(0);
  });

  test('a filled, stroked box rect keeps rect type, fill and stroke', () => {
    const shape = parseVmlShapeContent(pictOf(FILLED_RECT))!.shape;
    expect(shape.shapeType).toBe('rect');
    expect(shape.fill?.type).toBe('solid');
    expect(shape.fill?.color?.rgb).toBe('FF0000');
    expect(shape.outline?.color?.rgb).toBe('0000FF');
    expect(shape.size.width).toBe(100 * 12700);
    expect(shape.size.height).toBe(60 * 12700);
  });

  test('a v:rect carrying image data is left to the image parser (returns null)', () => {
    expect(parseVmlShapeContent(pictOf(IMAGE_PICT))).toBeNull();
  });
});
