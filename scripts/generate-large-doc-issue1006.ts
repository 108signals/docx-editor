/**
 * Generate a large "government template" DOCX for issue #1006.
 *
 * This fixture is structure-only synthetic content. It is intended to mimic the
 * shape of a large RFP/template document without using private source text:
 *
 *   - ~300 rendered pages, depending on browser/font metrics
 *   - thousands of paragraphs and bookmarks
 *   - dozens of sections with repeated headers
 *   - tables, numbered paragraphs, hyperlinks, fields, tabs, and SDTs
 *
 * Run: bun scripts/generate-large-doc-issue1006.ts
 */
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

const SECTION_COUNT = 33;
const BODY_PARAGRAPHS_PER_SECTION = 70;
const TARGET_BOOKMARKS = 4_250;

function contentTypesXml(): string {
  const headerOverrides: string[] = [];
  for (let section = 1; section <= SECTION_COUNT; section++) {
    headerOverrides.push(
      `  <Override PartName="/word/header${section}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
${headerOverrides.join('\n')}
</Types>`;
}

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="360" w:after="120"/><w:keepNext/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="240" w:after="80"/><w:keepNext/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

const sentences = [
  'The agency will evaluate each response for completeness technical merit delivery approach implementation risk and clarity of proposed responsibilities.',
  'Offerors should describe staffing assumptions governance cadence reporting expectations transition activities and measurable outcomes for each workstream.',
  'The template includes repeated references cross links structured placeholders and section-specific instructions that resemble a procurement document.',
  'Each subsection provides neutral synthetic language designed to exercise document layout without disclosing customer text or business details.',
  'Tables summarize roles milestones dependencies acceptance criteria and evidence requirements across multiple phases of the proposed program.',
  'Numbered items identify required response elements while bookmarks and fields provide anchor points for references throughout the document.',
  'The document intentionally mixes paragraphs tables hyperlinks tabs fields sections headers and structured document tags to stress editor behavior.',
  'Performance measurements should focus on load time typing latency cursor movement undo redo and scrolling after an edit.',
];

let bookmarkId = 0;
let bookmarkCount = 0;
let fieldCount = 0;
let hyperlinkCount = 0;
let numberedCount = 0;
let sdtCount = 0;
let tableCount = 0;
let tabCount = 0;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function nextBookmarkName(prefix: string): string {
  return `${prefix}_${bookmarkId}`;
}

function bookmarkStart(name: string): string {
  const id = bookmarkId++;
  bookmarkCount++;
  return `<w:bookmarkStart w:id="${id}" w:name="${escapeXml(name)}"/>`;
}

function bookmarkEnd(): string {
  return `<w:bookmarkEnd w:id="${bookmarkId - 1}"/>`;
}

function textRun(text: string): string {
  return `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function tabRun(): string {
  tabCount++;
  return '<w:r><w:tab/></w:r>';
}

function fieldRuns(target: string): string {
  fieldCount++;
  return [
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
    `<w:r><w:instrText xml:space="preserve"> REF ${escapeXml(target)} \\h </w:instrText></w:r>`,
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>',
    textRun('reference'),
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
  ].join('');
}

function hyperlinkRuns(target: string, text: string): string {
  hyperlinkCount++;
  return `<w:hyperlink w:anchor="${escapeXml(target)}">${textRun(text)}</w:hyperlink>`;
}

function paragraph(inner: string, options: { style?: string; numbered?: boolean } = {}): string {
  const props: string[] = [];
  if (options.style) props.push(`<w:pStyle w:val="${options.style}"/>`);
  if (options.numbered) {
    numberedCount++;
    props.push('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
  }
  const pPr = props.length > 0 ? `<w:pPr>${props.join('')}</w:pPr>` : '';
  return `<w:p>${pPr}${inner}</w:p>`;
}

function sdtParagraph(text: string): string {
  sdtCount++;
  const tag = `Issue1006Placeholder${sdtCount}`;
  return `<w:sdt>
  <w:sdtPr><w:alias w:val="${tag}"/><w:tag w:val="${tag}"/></w:sdtPr>
  <w:sdtContent>${paragraph(textRun(text))}</w:sdtContent>
</w:sdt>`;
}

function headerXml(sectionNumber: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t>Issue 1006 Synthetic Template</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r><w:t>Section ${sectionNumber}</w:t></w:r>
  </w:p>
</w:hdr>`;
}

function sectionProperties(sectionNumber: number): string {
  return `<w:sectPr>
  <w:headerReference w:type="default" r:id="rIdHeader${sectionNumber}"/>
  <w:pgSz w:w="12240" w:h="15840"/>
  <w:pgMar w:top="1440" w:right="1260" w:bottom="1440" w:left="1260" w:header="720" w:footer="720"/>
  <w:cols w:space="720"/>
  <w:docGrid w:linePitch="360"/>
</w:sectPr>`;
}

function sectionBreakParagraph(sectionNumber: number): string {
  return `<w:p><w:pPr>${sectionProperties(sectionNumber)}</w:pPr></w:p>`;
}

function table(sectionNumber: number, tableNumber: number): string {
  tableCount++;
  const rows: string[] = [];
  for (let row = 0; row < 6; row++) {
    const cells: string[] = [];
    for (let col = 0; col < 3; col++) {
      const text = `Section ${sectionNumber} table ${tableNumber} row ${row + 1} column ${
        col + 1
      } synthetic requirement detail for evaluation and tracking.`;
      cells.push(
        `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr>${paragraph(textRun(text))}</w:tc>`
      );
    }
    rows.push(`<w:tr>${cells.join('')}</w:tr>`);
  }
  return `<w:tbl>
  <w:tblPr><w:tblW w:w="8640" w:type="dxa"/><w:tblBorders>
    <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
  </w:tblBorders></w:tblPr>
  ${rows.join('\n')}
</w:tbl>`;
}

function bodyParagraph(sectionNumber: number, paraIndex: number): string {
  const globalIndex = (sectionNumber - 1) * BODY_PARAGRAPHS_PER_SECTION + paraIndex;
  const anchorName = nextBookmarkName('Issue1006Anchor');
  const extraAnchorNameA = nextBookmarkName('Issue1006ExtraAnchor');
  const extraAnchorNameB = nextBookmarkName('Issue1006CrossAnchor');
  const sentenceA = sentences[globalIndex % sentences.length];
  const sentenceB = sentences[(globalIndex + 3) % sentences.length];
  const runs: string[] = [
    bookmarkStart(anchorName),
    textRun(`Requirement ${sectionNumber}.${paraIndex + 1}. ${sentenceA} `),
    bookmarkEnd(),
  ];

  if (globalIndex % 2 === 0) {
    runs.push(bookmarkStart(extraAnchorNameA), textRun('template anchor '), bookmarkEnd());
  }
  if (globalIndex % 3 === 0) {
    runs.push(bookmarkStart(extraAnchorNameB), textRun('cross reference anchor '), bookmarkEnd());
  }
  if (globalIndex % 3 === 0) runs.push(tabRun());
  runs.push(textRun(`${sentenceB} `));
  if (globalIndex % 7 === 0) runs.push(hyperlinkRuns(anchorName, 'See related anchor. '));
  if (globalIndex % 10 === 0) runs.push(fieldRuns(anchorName));

  const numbered = globalIndex % 8 === 0;
  return paragraph(runs.join(''), { style: numbered ? 'ListParagraph' : undefined, numbered });
}

function generateDocument(): {
  documentXml: string;
  wordCount: number;
  charCount: number;
} {
  const blocks: string[] = [];
  let wordCount = 0;
  let charCount = 0;

  for (let section = 1; section <= SECTION_COUNT; section++) {
    const headingName = nextBookmarkName('Issue1006Section');
    const headingText = `Section ${section} Synthetic Government Template Requirements`;
    blocks.push(
      paragraph(`${bookmarkStart(headingName)}${textRun(headingText)}${bookmarkEnd()}`, {
        style: 'Heading1',
      })
    );
    wordCount += countWords(headingText);
    charCount += headingText.length;

    for (let p = 0; p < BODY_PARAGRAPHS_PER_SECTION; p++) {
      if (p % 20 === 0) {
        const subHeading = `${section}.${Math.floor(p / 20) + 1} Response Instructions`;
        blocks.push(paragraph(textRun(subHeading), { style: 'Heading2' }));
        wordCount += countWords(subHeading);
        charCount += subHeading.length;
      }

      if (p === 12 || p === 34) {
        blocks.push(table(section, p));
      }

      if ((section - 1) * BODY_PARAGRAPHS_PER_SECTION + p < 80) {
        const sdtText = `Structured placeholder ${section}.${p + 1} for synthetic template input.`;
        blocks.push(sdtParagraph(sdtText));
        wordCount += countWords(sdtText);
        charCount += sdtText.length;
      }

      const paragraphText = `${sentences[p % sentences.length]} ${
        sentences[(p + 3) % sentences.length]
      }`;
      blocks.push(bodyParagraph(section, p));
      wordCount += countWords(paragraphText) + 2;
      charCount += paragraphText.length;
    }

    if (section < SECTION_COUNT) {
      blocks.push(sectionBreakParagraph(section));
    }
  }

  const body = blocks.join('\n');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            mc:Ignorable="w14">
  <w:body>
    ${body}
    ${sectionProperties(SECTION_COUNT)}
  </w:body>
</w:document>`;

  return { documentXml, wordCount, charCount };
}

function documentRelationshipsXml(): string {
  const relationships: string[] = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
  ];
  for (let section = 1; section <= SECTION_COUNT; section++) {
    relationships.push(
      `<Relationship Id="rIdHeader${section}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header${section}.xml"/>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relationships.join('\n  ')}
</Relationships>`;
}

async function main() {
  console.log('Generating large DOCX for issue #1006 reproduction...');

  const { documentXml, wordCount, charCount } = generateDocument();
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml());
  zip.file('_rels/.rels', RELS_XML);
  zip.file('word/_rels/document.xml.rels', documentRelationshipsXml());
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/numbering.xml', NUMBERING_XML);
  zip.file('word/settings.xml', SETTINGS_XML);
  zip.file('word/document.xml', documentXml);

  for (let section = 1; section <= SECTION_COUNT; section++) {
    zip.file(`word/header${section}.xml`, headerXml(section));
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'e2e',
    'fixtures',
    'issue-1006-government-template.docx'
  );
  fs.writeFileSync(outputPath, buffer);

  console.log(`Generated: ${outputPath}`);
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`Words: ~${wordCount.toLocaleString()}`);
  console.log(`Characters: ~${charCount.toLocaleString()}`);
  console.log(`Sections: ${SECTION_COUNT}`);
  console.log(`Tables: ${tableCount}`);
  console.log(`Bookmarks: ${bookmarkCount}`);
  console.log(`Bookmark target: ${TARGET_BOOKMARKS}`);
  console.log(`Fields: ${fieldCount}`);
  console.log(`Hyperlinks: ${hyperlinkCount}`);
  console.log(`Numbered paragraphs: ${numberedCount}`);
  console.log(`SDTs: ${sdtCount}`);
  console.log(`Tabs: ${tabCount}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
