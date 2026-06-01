/**
 * Shared SVG builders for inline shapes.
 *
 * Both the editable ProseMirror node (ShapeExtension) and the paginated layout
 * painter need to turn a shape's attributes into the same SVG markup. Keeping
 * the geometry/fill/outline logic here lets the painted preview match the
 * editable view exactly (and avoids the painter depending on the PM extension).
 */

/** The subset of shape attributes needed to build SVG markup. */
export interface ShapeSvgAttrs {
  shapeType?: string;
  shapeId?: string;
  fillColor?: string;
  fillType?: string;
  gradientType?: string;
  gradientAngle?: number;
  gradientStops?: string;
  outlineWidth?: number;
  outlineColor?: string;
  outlineStyle?: string;
}

/**
 * Build the SVG geometry element for a shape preset. Unsupported presets fall
 * back to a rectangle.
 */
export function getShapeSVG(type: string, w: number, h: number): string {
  switch (type) {
    case 'ellipse':
    case 'oval':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" />`;
    case 'roundRect':
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.1}" />`;
    case 'triangle':
    case 'isosTriangle':
      return `<polygon points="${w / 2},0 ${w},${h} 0,${h}" />`;
    case 'diamond':
      return `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" />`;
    case 'line':
    case 'straightConnector1':
      return `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" />`;
    case 'rect':
    default:
      return `<rect x="0" y="0" width="${w}" height="${h}" />`;
  }
}

/**
 * Build SVG gradient <defs> content from shape attrs.
 */
export function buildSVGGradientDef(gradId: string, attrs: ShapeSvgAttrs): string {
  let stops = '';
  try {
    const parsed = JSON.parse(attrs.gradientStops || '[]') as Array<{
      position: number;
      color: string;
    }>;
    stops = parsed
      .map((s) => `<stop offset="${Math.round(s.position / 1000)}%" stop-color="${s.color}" />`)
      .join('');
  } catch {
    return '';
  }

  const gType = attrs.gradientType || 'linear';

  if (gType === 'radial' || gType === 'rectangular' || gType === 'path') {
    return `<radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`;
  }

  // Linear gradient — convert angle to SVG coordinates
  const angle = attrs.gradientAngle || 0;
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = Math.round(50 + 50 * Math.cos(rad + Math.PI));
  const y1 = Math.round(50 + 50 * Math.sin(rad + Math.PI));
  const x2 = Math.round(50 + 50 * Math.cos(rad));
  const y2 = Math.round(50 + 50 * Math.sin(rad));

  return `<linearGradient id="${gradId}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`;
}

/**
 * Build the complete `<svg>` markup for a shape (geometry + fill + outline).
 * Used by both the editable node view and the paginated painter so the two
 * representations stay in sync.
 */
export function buildShapeSVGMarkup(attrs: ShapeSvgAttrs, w: number, h: number): string {
  let svgDefs = '';
  let fill: string;

  if (attrs.fillType === 'gradient' && attrs.gradientStops) {
    const gradId = `grad-${attrs.shapeId || Math.random().toString(36).slice(2, 8)}`;
    fill = `url(#${gradId})`;
    svgDefs = buildSVGGradientDef(gradId, attrs);
  } else {
    fill = attrs.fillType === 'none' ? 'none' : attrs.fillColor || '#ffffff';
  }

  const strokeWidth = attrs.outlineWidth || 1;
  const strokeColor = attrs.outlineColor || '#000000';
  const strokeDash =
    attrs.outlineStyle === 'dashed'
      ? ' stroke-dasharray="8 4"'
      : attrs.outlineStyle === 'dotted'
        ? ' stroke-dasharray="2 2"'
        : '';

  const svgContent = getShapeSVG(attrs.shapeType || 'rect', w, h);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
    `style="fill:${fill};stroke:${strokeColor};stroke-width:${strokeWidth}${strokeDash}">` +
    (svgDefs ? `<defs>${svgDefs}</defs>` : '') +
    svgContent +
    `</svg>`
  );
}

/**
 * Build a `data:` URI wrapping the shape's SVG markup, suitable for an
 * `<img src>` in the paginated painter.
 */
export function buildShapeSVGDataUri(attrs: ShapeSvgAttrs, w: number, h: number): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildShapeSVGMarkup(attrs, w, h))}`;
}
