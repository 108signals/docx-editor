---
'@eigenpal/docx-editor-core': patch
---

Render drawn VML shapes on import (e.g. Word's "Horizontal Line"). A stroke-only `<w:pict><v:rect>` with no image data was previously dropped; it now parses into a shape and renders as a full-width rule. Fixes #811.
