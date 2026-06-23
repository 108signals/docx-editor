/**
 * Save-time renumbering of comment + tracked-change `w:id` values.
 *
 * The OOXML schema types these IDs as `ST_DecimalNumber` (unbounded
 * `xsd:integer`), but Word reads them as **signed int32** — anything
 * above `0x7FFFFFFF` triggers "unreadable content" / Document Recovery and
 * the comment or revision is dropped. This is the decimal counterpart to
 * the hex-id cap in `utils/hexId.ts`.
 *
 * Collaborative sessions partition the live ID space per peer (e.g.
 * `ydoc.clientID * 1_000_000`, see `commentIdAllocator.ts`), which routinely
 * lands IDs in the 10^12–10^15 range. That's fine in memory; on save we
 * compact every comment + revision ID down to a dense `1..N` sequence so the
 * file opens cleanly in Word. The remap is a no-op when every ID already fits,
 * so single-editor saves stay byte-for-byte identical.
 *
 * Body/header/footer/note content is rewritten in place — same convention as
 * `processNewImages` and the other rezip pre-passes — because that content is
 * rebuilt from editor state on every save, so the renumber is discarded with
 * it. The `comments` array is the exception: it is shared by reference with
 * live editor state (the sidebar cards, the collaboration `Y.Array`) and is
 * NOT regenerated per save, so renumbering it in place would silently change
 * the open session's comment IDs and desync them from the unchanged PM comment
 * marks and from peers. We therefore swap in shallow clones of the comments
 * before write-back so the renumber lands only on this save's snapshot.
 */

import type {
  Document,
  BlockContent,
  Paragraph,
  ParagraphContent,
  Run,
  Hyperlink,
  SimpleField,
  ComplexField,
  InlineSdt,
  Table,
} from '../../types/document';

/** Word's effective upper bound for `ST_DecimalNumber` `w:id` attributes. */
export const MAX_DECIMAL_ID = 0x7fffffff;

type IdVisitor = (id: number) => number;

function visitRun(run: Run, fn: IdVisitor): void {
  for (const pc of run.propertyChanges ?? []) pc.info.id = fn(pc.info.id);
}

function visitHyperlink(link: Hyperlink, fn: IdVisitor): void {
  for (const child of link.children) {
    if (child.type === 'run') visitRun(child, fn);
  }
}

function visitField(field: SimpleField | ComplexField, fn: IdVisitor): void {
  if (field.type === 'simpleField') {
    for (const c of field.content) {
      if (c.type === 'run') visitRun(c, fn);
      else if (c.type === 'hyperlink') visitHyperlink(c, fn);
    }
  } else {
    for (const r of field.fieldCode) visitRun(r, fn);
    for (const r of field.fieldResult) visitRun(r, fn);
  }
}

function visitInlineSdt(sdt: InlineSdt, fn: IdVisitor): void {
  for (const item of sdt.content) {
    if (item.type === 'run') visitRun(item, fn);
    else if (item.type === 'hyperlink') visitHyperlink(item, fn);
    else if (item.type === 'simpleField' || item.type === 'complexField') visitField(item, fn);
    else if (item.type === 'inlineSdt') visitInlineSdt(item, fn);
  }
}

function visitParagraphContent(item: ParagraphContent, fn: IdVisitor): void {
  switch (item.type) {
    case 'run':
      return visitRun(item, fn);
    case 'hyperlink':
      return visitHyperlink(item, fn);
    case 'simpleField':
    case 'complexField':
      return visitField(item, fn);
    case 'inlineSdt':
      return visitInlineSdt(item, fn);
    case 'commentRangeStart':
    case 'commentRangeEnd':
      item.id = fn(item.id);
      return;
    case 'insertion':
    case 'deletion':
    case 'moveFrom':
    case 'moveTo':
      item.info.id = fn(item.info.id);
      for (const c of item.content) {
        if (c.type === 'run') visitRun(c, fn);
        else if (c.type === 'hyperlink') visitHyperlink(c, fn);
      }
      return;
    case 'moveFromRangeStart':
    case 'moveFromRangeEnd':
    case 'moveToRangeStart':
    case 'moveToRangeEnd':
      item.id = fn(item.id);
      return;
    default:
      return;
  }
}

function visitParagraph(p: Paragraph, fn: IdVisitor): void {
  if (p.pPrIns) p.pPrIns.id = fn(p.pPrIns.id);
  if (p.pPrDel) p.pPrDel.id = fn(p.pPrDel.id);
  for (const pc of p.propertyChanges ?? []) pc.info.id = fn(pc.info.id);
  for (const item of p.content) visitParagraphContent(item, fn);
}

function visitTable(t: Table, fn: IdVisitor): void {
  for (const pc of t.propertyChanges ?? []) pc.info.id = fn(pc.info.id);
  for (const row of t.rows) {
    for (const pc of row.propertyChanges ?? []) pc.info.id = fn(pc.info.id);
    if (row.structuralChange) row.structuralChange.info.id = fn(row.structuralChange.info.id);
    for (const cell of row.cells) {
      for (const pc of cell.propertyChanges ?? []) pc.info.id = fn(pc.info.id);
      if (cell.structuralChange) cell.structuralChange.info.id = fn(cell.structuralChange.info.id);
      visitBlocks(cell.content, fn);
    }
  }
}

function visitBlocks(blocks: BlockContent[], fn: IdVisitor): void {
  for (const block of blocks) {
    if (block.type === 'paragraph') visitParagraph(block, fn);
    else if (block.type === 'table') visitTable(block, fn);
    else if (block.type === 'blockSdt') visitBlocks(block.content, fn);
  }
}

/** Visit every comment/revision `w:id` in the package via `fn` (write-back). */
function visitDocumentIds(doc: Document, fn: IdVisitor): void {
  const pkg = doc.package;
  visitBlocks(pkg.document.content, fn);
  for (const c of pkg.document.comments ?? []) {
    c.id = fn(c.id);
    if (c.parentId != null) c.parentId = fn(c.parentId);
  }
  for (const hf of pkg.headers?.values() ?? []) visitBlocks(hf.content, fn);
  for (const hf of pkg.footers?.values() ?? []) visitBlocks(hf.content, fn);
  for (const n of pkg.footnotes ?? []) visitBlocks(n.content, fn);
  for (const n of pkg.endnotes ?? []) visitBlocks(n.content, fn);
  for (const n of pkg.footnoteSeparators ?? []) visitBlocks(n.content, fn);
  for (const n of pkg.endnoteSeparators ?? []) visitBlocks(n.content, fn);
}

/**
 * If any comment or tracked-change ID in `doc` exceeds Word's signed-int32
 * limit, remap **all** of them to a dense `1..N` sequence (single sequence
 * shared across comments and revisions, since the editor uses one ID space for
 * both). Returns `true` when a remap was applied.
 *
 * No-op (returns `false`) when every ID already fits, so non-collab saves are
 * untouched. The live `comments` array is never mutated — see the file header.
 */
export function remapOversizedRevisionIds(doc: Document): boolean {
  // Read-only scan: collect every comment/revision ID (the identity write-back
  // leaves all objects, including the live comments, unchanged).
  const ids = new Set<number>();
  visitDocumentIds(doc, (id) => {
    ids.add(id);
    return id;
  });

  let max = 0;
  for (const id of ids) if (id > max) max = id;
  if (max <= MAX_DECIMAL_ID) return false;

  const sorted = [...ids].sort((a, b) => a - b);
  const remap = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) remap.set(sorted[i], i + 1);

  // Detach the comments from live editor state before write-back: shallow
  // clones share the comment bodies (never renumbered) but give us our own
  // `id`/`parentId` scalars to rewrite, so the open session keeps its IDs.
  const liveComments = doc.package.document.comments;
  if (liveComments) {
    doc.package.document.comments = liveComments.map((c) => ({ ...c }));
  }

  visitDocumentIds(doc, (id) => remap.get(id) ?? Math.min(id, MAX_DECIMAL_ID));
  return true;
}
