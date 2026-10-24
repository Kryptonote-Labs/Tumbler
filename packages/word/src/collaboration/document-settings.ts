import type * as Y from 'yjs';
import { isWordDocumentSettings, type WordDocumentSettings } from '../document-settings.ts';
import { stageWordUpdate } from './structured/transactions.ts';

export const WORD_DOCUMENT_SETTINGS = 'word-settings';

/** Each property is a separate shared register, so unrelated settings merge independently. */
export function readWordDocumentSettings(doc: Y.Doc): WordDocumentSettings {
  const settings = Object.fromEntries(doc.getMap(WORD_DOCUMENT_SETTINGS));
  if (!isWordDocumentSettings(settings)) throw new Error('Invalid document settings.');
  return settings;
}

export function writeWordDocumentSettings(doc: Y.Doc, patch: WordDocumentSettings) {
  if (!isWordDocumentSettings(patch)) throw new TypeError('Invalid document settings.');
  const settings = doc.getMap(WORD_DOCUMENT_SETTINGS);
  for (const [key, value] of Object.entries(patch)) settings.set(key, value);
}

/** Preparation is read-only; commitWordUpdate and ordinary document undo handle the resulting update. */
export function prepareWordDocumentSettings(doc: Y.Doc, patch: WordDocumentSettings) {
  return stageWordUpdate(doc, staged => { writeWordDocumentSettings(staged, patch); return undefined; });
}
