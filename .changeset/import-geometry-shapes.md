---
'@eigenpal/docx-editor-core': patch
---

Fix geometry shapes (non-text-box `wps:wsp` drawings such as stars, arrows and
other preset geometries) being silently dropped on import. `parseImage` returns
`null` for these drawings, so they never reached the document model. The
block-content text-box enrichment pass now also routes non-text-box drawings
through the existing `parseShapeFromDrawing`, preserving the preset geometry,
size, fill, outline and anchor so the shape round-trips back to a `wps:wsp`.
