import type { MarkViewConstructor } from 'prosemirror-view';

/** Host UI extensions leave document content and operations under the engine's control. */
export type NoteEditorOptions = {
  wikiLinkView?: MarkViewConstructor;
  codeLogo?: (language: string) => { light: string; dark: string } | undefined;
  codeLanguagePicker?: (
    host: HTMLElement,
    language: string,
    onchange: (language: string) => void,
  ) => { update: (language: string) => void; destroy: () => void };
};
