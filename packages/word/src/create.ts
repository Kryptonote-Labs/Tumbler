import { openZipArchive, writeZipArchiveChanges } from '@tumblerjs/opc';
import { openWordArtifact, type WordArtifact } from './artifact.ts';
import type { ComputedWordTextFormat } from './styles.ts';
import { xml, runProperties } from './create-xml.ts';
import { authoredContent, type WordContentBlock, type WordAuthoredImage } from './create-content.ts';

/** Supported authored text properties. Omitted properties inherit the document defaults. */
export type WordTextFormat = Partial<Pick<ComputedWordTextFormat, 'fontFamily' | 'fontSizePoints' | 'bold' | 'italic' | 'underline' | 'color'>>;
export interface WordTextRun { readonly source?: number; readonly sourceCopy?: string; readonly text: string; readonly format?: WordTextFormat; readonly image?: WordAuthoredImage; }
export interface WordTextParagraph {
  /** Reference into an immutable source package, retained by NativeWordDocument at import and export. */
  readonly source?: number;
  /** Independent copy identity. Omit for continuations, including paragraph splits. */
  readonly sourceCopy?: string;
  /** Optional stable identity for native editing; not serialized into Word content. */
  readonly id?: string;
  readonly runs: readonly WordTextRun[];
  readonly alignment?: 'start' | 'center' | 'end' | 'justify';
  readonly list?: { readonly id: string; readonly kind: 'bullet' | 'decimal'; readonly level?: number; readonly start?: number };
}
export interface CreateWordOptions {
  readonly paragraphs?: readonly WordTextParagraph[];
  /** Structured content. Mutually exclusive with paragraphs. */
  readonly blocks?: readonly WordContentBlock[];
  readonly defaultFormat?: WordTextFormat;
  /** Multiple of ordinary line height. Defaults to 1. */
  readonly lineSpacing?: number;
  /** Defaults to A4 with one-inch margins. Dimensions are in points. */
  readonly page?: { readonly width: number; readonly height: number; readonly margin: number };
  readonly author?: string;
  readonly lastModifiedBy?: string;
}

/** Creates an editable, standards-shaped DOCX in one package write, without per-run editing sessions. */
export function createWordArtifact(options: CreateWordOptions = {}): WordArtifact {
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const page = options.page ?? { width: 595.3, height: 841.9, margin: 72 };
  for (const value of [page.width, page.height, options.lineSpacing ?? 1]) if (!Number.isFinite(value) || value <= 0) throw new RangeError('Document dimensions and line spacing must be positive.');
  if (!Number.isFinite(page.margin) || page.margin < 0) throw new RangeError('Page margins must be nonnegative.');
  if (page.margin * 2 >= Math.min(page.width, page.height)) throw new RangeError('Page margins leave no content area.');
  const lineSpacing = Math.round((options.lineSpacing ?? 1) * 240);
  if (lineSpacing < 1 || lineSpacing > 2147483647) throw new RangeError('Line spacing is outside the WordprocessingML range.');
  if (options.blocks !== undefined && options.paragraphs !== undefined) throw new TypeError('Supply blocks or paragraphs, not both.');
  const authored = authoredContent(options.blocks ?? (options.paragraphs ?? [{ runs: [] }]).map(paragraph => ({ kind: 'paragraph', ...paragraph })), page.width - page.margin * 2);
  const content = authored.content;
  const parts = [
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${authored.contentTypes}</Types>`],
    ['_rels/.rels', `<Relationships xmlns="${relationships}"><Relationship Id="document" Type="${office}officeDocument" Target="word/document.xml"/><Relationship Id="properties" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${relationships}"><Relationship Id="styles" Type="${office}styles" Target="styles.xml"/><Relationship Id="settings" Type="${office}settings" Target="settings.xml"/>${authored.relationships}</Relationships>`],
    ['word/document.xml', `<w:document xmlns:w="${namespace}" xmlns:r="${office.slice(0, -1)}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${content}<w:sectPr><w:pgSz w:w="${Math.round(page.width * 20)}" w:h="${Math.round(page.height * 20)}"/><w:pgMar w:top="${Math.round(page.margin * 20)}" w:right="${Math.round(page.margin * 20)}" w:bottom="${Math.round(page.margin * 20)}" w:left="${Math.round(page.margin * 20)}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`],
    ['word/styles.xml', `<w:styles xmlns:w="${namespace}"><w:docDefaults><w:rPrDefault><w:rPr>${runProperties(options.defaultFormat ?? { fontFamily: 'Aptos', fontSizePoints: 12 })}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="${lineSpacing}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`],
    ['word/settings.xml', `<w:settings xmlns:w="${namespace}"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ['docProps/core.xml', `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${options.author === undefined ? '' : `<dc:creator>${xml(options.author)}</dc:creator>`}${options.lastModifiedBy === undefined ? '' : `<cp:lastModifiedBy>${xml(options.lastModifiedBy)}</cp:lastModifiedBy>`}</cp:coreProperties>`],
  ];
  const empty = new Uint8Array(22);
  empty.set([0x50, 0x4b, 0x05, 0x06]);
  const encode = new TextEncoder();
  return openWordArtifact(writeZipArchiveChanges(openZipArchive(empty), {
    additions: [...parts.map(([name, content]) => ({ name: name!, data: encode.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`) })), ...authored.parts],
  }), { maxBlocks: Number.MAX_SAFE_INTEGER, maxInlineItems: Number.MAX_SAFE_INTEGER, maxTextCharacters: Number.MAX_SAFE_INTEGER });
}

