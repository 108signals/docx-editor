/**
 * VML drawn-shape parser.
 *
 * Legacy VML (`<w:pict>`) can carry a *drawn* shape with no `<v:imagedata>` —
 * e.g. Word's "Horizontal Line" (Insert > Horizontal Line) is a stroke-only
 * `<v:rect style="width:468pt;height:.05pt" filled="f">` whose collapsed box
 * reads as a thin rule. `parseVmlImageContent` returns null for these (no image
 * data), so they were dropped on import (issue #811).
 *
 * This parser turns such drawn VML shapes into a {@link Shape} so the geometry
 * shape pipeline (toProseDoc → inline SVG → painter) renders them, matching the
 * DrawingML `wps:wsp` path added for geometry shapes.
 */
import type { Shape, ShapeFill, ShapeOutline, ShapeType } from '../types/content/shape';
import type { ShapeContent } from '../types/content/run';
import { getAttribute, getChildElements, findAllDeep, type XmlElement } from './xmlParser';
import { isWatermarkShape, parseStyleAttr } from './vmlWatermarkParser';

const EMU_PER_PT = 12700;

/** Parse a CSS-ish VML length (`468pt`, `.05pt`, `12px`) to EMUs. */
function vmlLengthToEmu(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(-?[\d.]+)\s*(pt|px|in|cm|mm)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2]) {
    case 'px':
      return Math.round((n / 96) * 914400);
    case 'in':
      return Math.round(n * 914400);
    case 'cm':
      return Math.round(n * 360000);
    case 'mm':
      return Math.round(n * 36000);
    case 'pt':
    default:
      return Math.round(n * EMU_PER_PT);
  }
}

/** Normalise a VML color (`#a0a0a0`, `red`, `black`) to a hex string sans `#`. */
function vmlColorToRgb(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'none') return undefined;
  const named: Record<string, string> = {
    black: '000000',
    white: 'FFFFFF',
    red: 'FF0000',
    green: '008000',
    blue: '0000FF',
    gray: '808080',
    grey: '808080',
    silver: 'C0C0C0',
  };
  if (named[v]) return named[v];
  const hex = v.replace('#', '');
  return /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : undefined;
}

/** `true`/`t`/`on`/`1` → true; `false`/`f`/`off`/`0` → false; default `def`. */
function vmlBool(value: string | null | undefined, def: boolean): boolean {
  if (value == null) return def;
  const v = value.trim().toLowerCase();
  if (v === 't' || v === 'true' || v === 'on' || v === '1') return true;
  if (v === 'f' || v === 'false' || v === 'off' || v === '0') return false;
  return def;
}

const DRAWN_SHAPE_TAGS: Array<[string, ShapeType]> = [
  ['rect', 'rect'],
  ['roundrect', 'roundRect'],
  ['oval', 'ellipse'],
  ['line', 'line'],
];

/**
 * Parse a `w:pict`/`w:object` carrying a drawn (non-image) VML shape into a
 * {@link ShapeContent}, or null when it has no drawn shape (it's an image,
 * watermark, or empty). Image picts are owned by `parseVmlImageContent`.
 */
export function parseVmlShapeContent(pictElement: XmlElement): ShapeContent | null {
  for (const [tag, baseType] of DRAWN_SHAPE_TAGS) {
    for (const el of findAllDeep(pictElement, 'v', tag)) {
      // Image shapes (with <v:imagedata>) are handled by parseVmlImageContent.
      const hasImageData = getChildElements(el).some(
        (c) => c.name === 'v:imagedata' || c.name?.endsWith(':imagedata')
      );
      if (hasImageData) continue;

      const idLower = (getAttribute(el, null, 'id') ?? '').toLowerCase();
      if (isWatermarkShape(el, idLower)) continue;

      const style = parseStyleAttr(getAttribute(el, null, 'style'));
      const widthEmu = vmlLengthToEmu(style['width']);
      const heightEmu = vmlLengthToEmu(style['height']);
      if (widthEmu == null || widthEmu <= 0) continue;

      const filled = vmlBool(getAttribute(el, null, 'filled'), true);
      const stroked = vmlBool(getAttribute(el, null, 'stroked'), true);
      // Word's "Horizontal Line" is a stroke-only rect collapsed to a hairline.
      // Render it as a `line` so the SVG draws a visible rule regardless of the
      // near-zero box height.
      const isHairlineRect =
        baseType === 'rect' && !filled && heightEmu != null && heightEmu <= EMU_PER_PT; // ≤ 1pt tall
      const shapeType: ShapeType = isHairlineRect ? 'line' : baseType;

      const fillRgb = vmlColorToRgb(getAttribute(el, null, 'fillcolor'));
      const fill: ShapeFill | undefined =
        !filled || fillRgb == null
          ? filled
            ? undefined
            : { type: 'none' }
          : { type: 'solid', color: { rgb: fillRgb } };

      let outline: ShapeOutline | undefined;
      if (stroked) {
        const strokeRgb = vmlColorToRgb(getAttribute(el, null, 'strokecolor')) ?? '000000';
        const weightEmu = vmlLengthToEmu(getAttribute(el, null, 'strokeweight'));
        outline = {
          color: { rgb: strokeRgb },
          // VML's default stroke weight is 0.75pt when unspecified.
          width: weightEmu ?? Math.round(0.75 * EMU_PER_PT),
          style: 'solid',
        };
      }

      // A `line` shape needs a non-zero box height for the SVG viewport; fall
      // back to the stroke width so the rule is visible and vertically centred.
      const height =
        shapeType === 'line'
          ? Math.max(heightEmu ?? 0, outline?.width ?? Math.round(0.75 * EMU_PER_PT))
          : (heightEmu ?? widthEmu);

      const shape: Shape = {
        type: 'shape',
        shapeType,
        size: { width: widthEmu, height },
        wrap: { type: 'inline' },
        ...(fill ? { fill } : {}),
        ...(outline ? { outline } : {}),
      };
      const id = getAttribute(el, null, 'id');
      if (id) shape.id = id;

      return { type: 'shape', shape };
    }
  }
  return null;
}
