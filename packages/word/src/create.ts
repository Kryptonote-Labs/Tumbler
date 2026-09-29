import { openZipArchive, writeZipArchiveChanges } from '@tumblerjs/opc';
import { openWordArtifact, type WordArtifact } from './artifact.ts';
import type { ComputedWordTextFormat } from './styles.ts';

/** Supported authored text properties. Omitted properties inherit the document defaults. */
export type WordTextFormat = Partial<Pick<ComputedWordTextFormat, 'fontFamily' | 'fontSizePoints' | 'bold' | 'italic' | 'underline' | 'color'>>;
export interface WordTextRun { readonly text: string; readonly format?: WordTextFormat; }
export interface WordTextParagraph {
  readonly runs: readonly WordTextRun[];
  readonly alignment?: 'start' | 'center' | 'end' | 'justify';
}
export interface CreateWordOptions {
  readonly paragraphs?: readonly WordTextParagraph[];
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
  const paragraphs = options.paragraphs?.length ? options.paragraphs : [{ runs: [] }];
  const content = paragraphs.map(paragraph => {
    if (paragraph.alignment !== undefined && !['start', 'center', 'end', 'justify'].includes(paragraph.alignment)) throw new TypeError('Unsupported paragraph alignment.');
    return `<w:p>${paragraph.alignment ? `<w:pPr><w:jc w:val="${paragraph.alignment}"/></w:pPr>` : ''}${paragraph.runs.map(run => `<w:r>${run.format ? `<w:rPr>${runProperties(run.format)}</w:rPr>` : ''}${textContent(run.text)}</w:r>`).join('')}</w:p>`;
  }).join('');
  const parts = [
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `<Relationships xmlns="${relationships}"><Relationship Id="document" Type="${office}officeDocument" Target="word/document.xml"/><Relationship Id="properties" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="${relationships}"><Relationship Id="styles" Type="${office}styles" Target="styles.xml"/><Relationship Id="settings" Type="${office}settings" Target="settings.xml"/></Relationships>`],
    ['word/document.xml', `<w:document xmlns:w="${namespace}"><w:body>${content}<w:sectPr><w:pgSz w:w="${Math.round(page.width * 20)}" w:h="${Math.round(page.height * 20)}"/><w:pgMar w:top="${Math.round(page.margin * 20)}" w:right="${Math.round(page.margin * 20)}" w:bottom="${Math.round(page.margin * 20)}" w:left="${Math.round(page.margin * 20)}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`],
    ['word/styles.xml', `<w:styles xmlns:w="${namespace}"><w:docDefaults><w:rPrDefault><w:rPr>${runProperties(options.defaultFormat ?? { fontFamily: 'Aptos', fontSizePoints: 12 })}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="${lineSpacing}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`],
    ['word/settings.xml', `<w:settings xmlns:w="${namespace}"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ['docProps/core.xml', `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${options.author === undefined ? '' : `<dc:creator>${xml(options.author)}</dc:creator>`}${options.lastModifiedBy === undefined ? '' : `<cp:lastModifiedBy>${xml(options.lastModifiedBy)}</cp:lastModifiedBy>`}</cp:coreProperties>`],
  ];
  const empty = new Uint8Array(22);
  empty.set([0x50, 0x4b, 0x05, 0x06]);
  const encode = new TextEncoder();
  return openWordArtifact(writeZipArchiveChanges(openZipArchive(empty), {
    additions: parts.map(([name, content]) => ({ name: name!, data: encode.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`) })),
  }));
}

function xml(value: string) {
  if (!value.isWellFormed()) throw new TypeError('Text contains unpaired UTF-16 surrogates.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new TypeError('Text contains characters not supported by XML.');
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function textContent(value: string) {
  if (/[\r\n]/.test(value)) throw new TypeError('Use separate paragraphs for line-feed text.');
  return value.split('\t').map(part => `<w:t xml:space="preserve">${xml(part)}</w:t>`).join('<w:tab/>');
}

function runProperties(format: WordTextFormat) {
  const output: string[] = [];
  // CT_RPr order follows the WordprocessingML schema.
  if (format.fontFamily !== undefined) output.push(`<w:rFonts w:ascii="${xml(format.fontFamily)}" w:hAnsi="${xml(format.fontFamily)}" w:eastAsia="${xml(format.fontFamily)}" w:cs="${xml(format.fontFamily)}"/>`);
  if (format.bold !== undefined) output.push(`<w:b w:val="${format.bold ? 1 : 0}"/>`);
  if (format.italic !== undefined) output.push(`<w:i w:val="${format.italic ? 1 : 0}"/>`);
  if (format.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(format.color)) throw new TypeError('Text color must be a six-digit RGB value.');
    output.push(`<w:color w:val="${format.color.slice(1).toUpperCase()}"/>`);
  }
  if (format.fontSizePoints !== undefined) {
    if (!Number.isFinite(format.fontSizePoints) || format.fontSizePoints < 1 || format.fontSizePoints > 409) throw new RangeError('Font size must be between 1 and 409 points.');
    output.push(`<w:sz w:val="${Math.round(format.fontSizePoints * 2)}"/>`);
  }
  if (format.underline !== undefined) {
    if (!['none', 'single', 'double'].includes(format.underline)) throw new TypeError('Unsupported underline style.');
    output.push(`<w:u w:val="${format.underline}"/>`);
  }
  return output.join('');
}
