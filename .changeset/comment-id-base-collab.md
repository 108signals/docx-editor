---
'@eigenpal/docx-editor-core': minor
'@eigenpal/docx-editor-react': minor
'@eigenpal/docx-editor-vue': minor
---

Add `commentIdBase`/`commentIdStride` props to partition comment/revision IDs per collaborating peer. On save, oversized IDs are renumbered to fit Word's signed-int32 `w:id` limit so collaborative documents open cleanly. Fixes #257.
