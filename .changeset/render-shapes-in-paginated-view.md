---
"@eigenpal/docx-editor-core": patch
---

Render inline shapes in the paginated layout instead of dropping them. The
editable ProseMirror view already drew `shape` nodes via their node view, but
the layout-bridge had no `shape` branch, so inline shapes vanished from the
painted/measured preview — leaving an empty gap. The bridge now converts a
shape into an inline SVG-image run (reusing the existing image
measuring/hit-testing/selection path), and the SVG-building logic is shared
between the node view and the painter so the two representations stay in sync.
