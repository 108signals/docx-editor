---
"@eigenpal/docx-editor-core": patch
---

Fix geometry shapes (wps:wsp) being dropped or misrendered on import and in the paginated layout.

**Before:** Inline geometry shapes (triangles, ellipses, diamonds, etc.) were silently
dropped on import, and any shape drawing produced a spurious broken-image placeholder
beside it. The paginated preview showed only the placeholder; the editable view was
empty too.

**After:**
- `blockContentParser` now routes `wps:wsp` drawings through `parseShapeFromDrawing`
  instead of discarding them, so each shape becomes a `shape` ProseMirror node.
- `imageParser.parseDrawing` skips `wps:wsp` drawings (the same early-return guard
  that already existed for text-boxes), eliminating the broken-image placeholder that
  appeared to the left of every shape.
- A shared `buildShapeSVGMarkup` utility in `utils/shapeSvg.ts` generates the inline
  SVG (geometry + fill + outline) used by both the editable node view and the new
  paginated-preview bridge, so the two representations stay in sync.
- `toFlowBlocks/runs.ts` converts inline `shape` nodes into SVG-data-URI `ImageRun`s,
  making the paginated painter draw shapes with no changes to the measuring, hit-testing,
  or selection infrastructure.
- The SVG `viewBox` is expanded by `strokeWidth/2` on each side so shape borders are
  not clipped by the `<img>` viewport.
