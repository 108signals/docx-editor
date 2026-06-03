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
 * Build points string for a regular polygon centered in (w, h).
 */
function regularPolygon(n: number, w: number, h: number, startAngle = -Math.PI / 2): string {
  const cx = w / 2,
    cy = h / 2,
    rx = w / 2,
    ry = h / 2;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = startAngle + (2 * Math.PI * i) / n;
    pts.push(`${(cx + rx * Math.cos(a)).toFixed(2)},${(cy + ry * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" />`;
}

/**
 * Build an n-point star.  outerFrac is the inner-radius fraction of the outer radius.
 */
function starPolygon(n: number, outerFrac: number, w: number, h: number): string {
  const cx = w / 2,
    cy = h / 2,
    rx = w / 2,
    ry = h / 2;
  const rix = rx * outerFrac,
    riy = ry * outerFrac;
  const total = n * 2;
  const pts: string[] = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < total; i++) {
    const a = start + (Math.PI * i) / n;
    const isOuter = i % 2 === 0;
    pts.push(
      `${(cx + (isOuter ? rx : rix) * Math.cos(a)).toFixed(2)},${(cy + (isOuter ? ry : riy) * Math.sin(a)).toFixed(2)}`
    );
  }
  return `<polygon points="${pts.join(' ')}" />`;
}

/**
 * Build SVG markup for an arrow pointing right.
 * shaftFrac: height fraction for the shaft (0.4 = 40% of height)
 * headFrac: width fraction for the arrowhead (0.35 = 35% of width)
 */
function rightArrowPath(w: number, h: number, shaftFrac = 0.4, headFrac = 0.35): string {
  const s = (h * shaftFrac) / 2; // half shaft height
  const hx = w * (1 - headFrac); // x where head starts
  const my = h / 2;
  const pts = [
    `0,${my - s}`,
    `${hx},${my - s}`,
    `${hx},0`,
    `${w},${my}`,
    `${hx},${h}`,
    `${hx},${my + s}`,
    `0,${my + s}`,
  ].join(' ');
  return `<polygon points="${pts}" />`;
}

/**
 * Build SVG geometry element for a shape preset. Unsupported presets fall back to a rectangle.
 */
export function getShapeSVG(type: string, w: number, h: number): string {
  switch (type) {
    // ── Ellipse / Circle ──────────────────────────────────────────────────
    case 'ellipse':
    case 'oval':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" />`;

    // ── Rounded rectangle ─────────────────────────────────────────────────
    case 'roundRect':
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.1}" />`;

    // ── Triangles ─────────────────────────────────────────────────────────
    case 'triangle':
    case 'isosTriangle':
      return `<polygon points="${w / 2},0 ${w},${h} 0,${h}" />`;

    case 'rtTriangle':
      return `<polygon points="0,0 ${w},${h} 0,${h}" />`;

    // ── Diamond ───────────────────────────────────────────────────────────
    case 'diamond':
      return `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" />`;

    // ── Parallelogram ─────────────────────────────────────────────────────
    case 'parallelogram': {
      const offset = w * 0.2;
      return `<polygon points="${offset},0 ${w},0 ${w - offset},${h} 0,${h}" />`;
    }

    // ── Trapezoid ─────────────────────────────────────────────────────────
    case 'trapezoid': {
      const inset = w * 0.2;
      return `<polygon points="${inset},0 ${w - inset},0 ${w},${h} 0,${h}" />`;
    }

    // ── Regular polygons ──────────────────────────────────────────────────
    case 'pentagon':
      return regularPolygon(5, w, h);
    case 'hexagon':
      return regularPolygon(6, w, h, 0);
    case 'heptagon':
      return regularPolygon(7, w, h);
    case 'octagon':
      return regularPolygon(8, w, h, Math.PI / 8);
    case 'decagon':
      return regularPolygon(10, w, h);
    case 'dodecagon':
      return regularPolygon(12, w, h);

    // ── Stars ─────────────────────────────────────────────────────────────
    case 'star4':
      return starPolygon(4, 0.35, w, h);
    case 'star5':
      return starPolygon(5, 0.38, w, h);
    case 'star6':
      return starPolygon(6, 0.45, w, h);
    case 'star7':
      return starPolygon(7, 0.45, w, h);
    case 'star8':
      return starPolygon(8, 0.38, w, h);
    case 'star10':
      return starPolygon(10, 0.42, w, h);
    case 'star12':
      return starPolygon(12, 0.45, w, h);
    case 'star16':
      return starPolygon(16, 0.5, w, h);
    case 'star24':
      return starPolygon(24, 0.55, w, h);
    case 'star32':
      return starPolygon(32, 0.6, w, h);

    // ── Lines / Connectors ────────────────────────────────────────────────
    case 'line':
    case 'straightConnector1':
      return `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" />`;
    case 'bentConnector2':
    case 'bentConnector3':
    case 'bentConnector4':
    case 'bentConnector5':
    case 'curvedConnector2':
    case 'curvedConnector3':
    case 'curvedConnector4':
    case 'curvedConnector5':
      return `<polyline points="0,${h} ${w / 2},${h} ${w / 2},0 ${w},0" fill="none" />`;

    // ── Arrows ────────────────────────────────────────────────────────────
    case 'rightArrow':
      return rightArrowPath(w, h);
    case 'leftArrow': {
      const p = rightArrowPath(w, h);
      // Mirror horizontally via transform on a group
      return `<g transform="scale(-1,1) translate(${-w},0)">${p}</g>`;
    }
    case 'upArrow': {
      const p = rightArrowPath(h, w);
      return `<g transform="rotate(-90,${w / 2},${h / 2}) translate(${(w - h) / 2},${(h - w) / 2})">${p}</g>`;
    }
    case 'downArrow': {
      const p = rightArrowPath(h, w);
      return `<g transform="rotate(90,${w / 2},${h / 2}) translate(${(w - h) / 2},${(h - w) / 2})">${p}</g>`;
    }
    case 'leftRightArrow': {
      // Two arrowheads facing left and right
      const s = (h * 0.4) / 2;
      const hx = w * 0.35;
      const my = h / 2;
      const pts = [
        `0,${my}`,
        `${hx},0`,
        `${hx},${my - s}`,
        `${w - hx},${my - s}`,
        `${w - hx},0`,
        `${w},${my}`,
        `${w - hx},${h}`,
        `${w - hx},${my + s}`,
        `${hx},${my + s}`,
        `${hx},${h}`,
      ].join(' ');
      return `<polygon points="${pts}" />`;
    }
    case 'upDownArrow': {
      const s = (w * 0.4) / 2;
      const hy = h * 0.35;
      const mx = w / 2;
      const pts = [
        `${mx},0`,
        `${w},${hy}`,
        `${mx + s},${hy}`,
        `${mx + s},${h - hy}`,
        `${w},${h - hy}`,
        `${mx},${h}`,
        `0,${h - hy}`,
        `${mx - s},${h - hy}`,
        `${mx - s},${hy}`,
        `0,${hy}`,
      ].join(' ');
      return `<polygon points="${pts}" />`;
    }
    case 'chevron': {
      const cut = w * 0.25;
      const pts = `0,0 ${w - cut},0 ${w},${h / 2} ${w - cut},${h} 0,${h} ${cut},${h / 2}`;
      return `<polygon points="${pts}" />`;
    }
    case 'homePlate':
    case 'notchedRightArrow': {
      const cut = w * 0.25;
      const pts = `0,0 ${w - cut},0 ${w},${h / 2} ${w - cut},${h} 0,${h} ${cut},${h / 2}`;
      return `<polygon points="${pts}" />`;
    }

    // ── Flowchart shapes ─────────────────────────────────────────────────
    case 'flowChartProcess':
      return `<rect x="0" y="0" width="${w}" height="${h}" />`;
    case 'flowChartAlternateProcess':
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.15}" />`;
    case 'flowChartDecision':
      return `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" />`;
    case 'flowChartConnector':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" />`;
    case 'flowChartTerminator': {
      const r = Math.min(w, h) / 2;
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" />`;
    }
    case 'flowChartPreparation': {
      const in2 = w * 0.2;
      return `<polygon points="${in2},0 ${w - in2},0 ${w},${h / 2} ${w - in2},${h} ${in2},${h} 0,${h / 2}" />`;
    }
    case 'flowChartManualInput': {
      const slant = h * 0.25;
      return `<polygon points="0,${slant} ${w},0 ${w},${h} 0,${h}" />`;
    }
    case 'flowChartDocument': {
      const bump = h * 0.15;
      const by = h - bump;
      return `<path d="M0,0 H${w} V${by} Q${w * 0.75},${h} ${w / 2},${by} Q${w * 0.25},${by - bump * 2} 0,${by} Z" />`;
    }
    case 'flowChartInputOutput': {
      const off = w * 0.2;
      return `<polygon points="${off},0 ${w},0 ${w - off},${h} 0,${h}" />`;
    }
    case 'flowChartPredefinedProcess': {
      const bar = w * 0.1;
      return `<g>
        <rect x="0" y="0" width="${w}" height="${h}" />
        <line x1="${bar}" y1="0" x2="${bar}" y2="${h}" stroke-width="1" />
        <line x1="${w - bar}" y1="0" x2="${w - bar}" y2="${h}" stroke-width="1" />
      </g>`;
    }
    case 'flowChartDelay': {
      const r = h / 2;
      return `<path d="M0,0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H0 Z" />`;
    }
    case 'flowChartDisplay': {
      const r = h / 2;
      const lx = w * 0.2;
      return `<path d="M${lx},0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H${lx} L0,${h / 2} Z" />`;
    }
    case 'flowChartSort':
      return `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" />`;
    case 'flowChartSummingJunction':
    case 'flowChartOr': {
      const r = Math.min(w, h) / 2;
      const cx2 = w / 2,
        cy2 = h / 2;
      return `<g>
        <ellipse cx="${cx2}" cy="${cy2}" rx="${r}" ry="${r}" />
        <line x1="${cx2}" y1="${cy2 - r}" x2="${cx2}" y2="${cy2 + r}" />
        <line x1="${cx2 - r}" y1="${cy2}" x2="${cx2 + r}" y2="${cy2}" />
      </g>`;
    }
    case 'flowChartMagneticDisk': {
      const ry = h * 0.15;
      return `<g>
        <path d="M0,${ry} A${w / 2},${ry} 0 0 1 ${w},${ry} V${h - ry} A${w / 2},${ry} 0 0 1 0,${h - ry} Z" />
        <path d="M0,${ry} A${w / 2},${ry} 0 0 0 ${w},${ry}" fill="none" />
      </g>`;
    }

    // ── Callouts (simplified as rounded rect with tail) ───────────────────
    case 'wedgeRectCallout':
    case 'wedgeRoundRectCallout':
    case 'wedgeEllipseCallout':
    case 'cloudCallout':
    case 'callout1':
    case 'callout2':
    case 'callout3':
    case 'borderCallout1':
    case 'borderCallout2':
    case 'borderCallout3':
    case 'accentCallout1':
    case 'accentCallout2':
    case 'accentCallout3': {
      const tailH = h * 0.2;
      const bodyH = h - tailH;
      const r = Math.min(w, bodyH) * 0.1;
      return `<g>
        <rect x="0" y="0" width="${w}" height="${bodyH}" rx="${r}" />
        <polygon points="${w * 0.3},${bodyH} ${w * 0.2},${h} ${w * 0.45},${bodyH}" />
      </g>`;
    }

    // ── Plus / Cross ──────────────────────────────────────────────────────
    case 'plus':
    case 'mathPlus': {
      const t = Math.min(w, h) * 0.3;
      const mx = (w - t) / 2,
        my = (h - t) / 2;
      return `<polygon points="${mx},0 ${mx + t},0 ${mx + t},${my} ${w},${my} ${w},${my + t} ${mx + t},${my + t} ${mx + t},${h} ${mx},${h} ${mx},${my + t} 0,${my + t} 0,${my} ${mx},${my}" />`;
    }

    // ── Rectangle (default) ───────────────────────────────────────────────
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

  // Expand the viewBox by half the stroke width on each side so the stroke is
  // not clipped at the shape edges. The width/height attributes on the <svg>
  // element stay the same (the img container defines the visible size).
  const pad = strokeWidth / 2;
  const svgContent = getShapeSVG(attrs.shapeType || 'rect', w, h);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="${-pad} ${-pad} ${w + strokeWidth} ${h + strokeWidth}" ` +
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
