import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname } from 'node:path';
import {
  applySpreadsheetCommand,
  createSpreadsheet,
  inspectSpreadsheet,
  openSpreadsheetArtifact,
} from '@tumblerjs/sheets';
import type { SpreadsheetOperationHost } from './spreadsheets.ts';

const revision = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
function check(path: string) {
  if (extname(path).toLowerCase() !== '.xlsx')
    throw new Error('Spreadsheet commands require a .xlsx file.');
}
export function createSpreadsheetFile(path: string) {
  check(path);
  const artifact = createSpreadsheet();
  const bytes = artifact.bytes();
  writeFileSync(path, bytes, { flag: 'wx' });
  return { page: revision(bytes), ...inspectSpreadsheet(artifact) };
}

/** Reads preserve the source; edits use the same sibling lock and atomic rename as Word. */
export function spreadsheetFileHost(): Required<SpreadsheetOperationHost> {
  return {
    async readSpreadsheet(path, input) {
      check(path);
      const bytes = readFileSync(path);
      return {
        page: revision(bytes),
        ...inspectSpreadsheet(openSpreadsheetArtifact(bytes), input.sheetId, input.range),
      };
    },
    async operateSpreadsheet(path, input) {
      check(path);
      path = realpathSync(path);
      if (!input.page) throw new Error('Read the spreadsheet and supply --page before editing.');
      const lock = path + '.tumbler-lock';
      const descriptor = openSync(lock, 'wx');
      const temporary = path + '.' + randomUUID() + '.tmp';
      try {
        const original = readFileSync(path);
        if (revision(original) !== input.page)
          throw new Error('The spreadsheet changed. Read it again before editing.');
        const result = applySpreadsheetCommand(openSpreadsheetArtifact(original), input.command);
        const bytes = result.bytes();
        writeFileSync(temporary, bytes, { flag: 'wx', mode: statSync(path).mode });
        if (revision(readFileSync(path)) !== input.page)
          throw new Error('The spreadsheet changed while editing. Read it again.');
        renameSync(temporary, path);
        return { page: revision(bytes), ...inspectSpreadsheet(result) };
      } finally {
        try {
          unlinkSync(temporary);
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        closeSync(descriptor);
        unlinkSync(lock);
      }
    },
  };
}
