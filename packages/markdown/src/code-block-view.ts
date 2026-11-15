import type { NodeViewConstructor } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { noteCodeLanguage, noteCodeLanguages } from './code-highlighting';
import { NoteCopyFeedback } from './copy-feedback';
import type { NoteEditorOptions } from './editor-options';
function icon(kind: 'copy' | 'check') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(`note-copy-${kind}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', kind === 'check' ? 'm5 12 4 4L19 6' : 'M9 9h11v11H9z M15 9V4H4v11h5');
  svg.append(path);
  return svg;
}

/** Only `code` is editable. The header stays out of document content, selections, and exports. */
export function noteCodeBlockView(options: NoteEditorOptions = {}): NodeViewConstructor {
  return (initial, view, getPos) => {
    let node = initial;
    const dom = document.createElement('div');
    dom.className = 'note-code-block';
    dom.setAttribute('spellcheck', 'false');
    const header = document.createElement('div');
    header.className = 'note-code-header';
    header.contentEditable = 'false';
    const language = document.createElement('span');
    language.className = 'note-code-language';
    language.inert = !view.editable;
    const picker = options.codeLanguagePicker?.(
      language,
      noteCodeLanguage(node.attrs.params),
      (params) => {
        const pos = getPos();
        if (!view.editable || pos === undefined) return;
        const current = view.state.doc.nodeAt(pos);
        if (current?.type !== initial.type) return;
        const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, params });
        const { selection } = view.state;
        if (selection.from < pos + 1 || selection.to > pos + current.nodeSize - 1)
          tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        view.dispatch(tr);
        view.focus();
      },
    );
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-code-copy';
    button.dataset.state = 'idle';
    button.setAttribute('aria-label', 'Copy code');
    button.title = 'Copy code';
    button.append(icon('copy'), icon('check'));
    const status = document.createElement('span');
    status.className = 'note-code-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    header.append(language, button, status);
    const pre = document.createElement('pre');
    pre.setAttribute('spellcheck', 'false');
    pre.setAttribute('autocorrect', 'off');
    pre.setAttribute('autocapitalize', 'off');
    const contentDOM = document.createElement('code');
    contentDOM.setAttribute('spellcheck', 'false');
    pre.append(contentDOM);
    dom.append(header, pre);
    const feedback = new NoteCopyFeedback(
      () => node.textContent,
      (state) => {
        button.dataset.state = state;
        const label =
          state === 'copied'
            ? 'Code copied'
            : state === 'failed'
              ? 'Copy failed. Select the code and copy it with your keyboard.'
              : 'Copy code';
        button.setAttribute('aria-label', label);
        button.title = label;
        status.textContent = state === 'idle' ? '' : label;
      },
    );
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      void feedback.copy();
    });
    const updateLanguage = () => {
      const value = noteCodeLanguage(node.attrs.params);
      pre.dataset.params = node.attrs.params;
      if (picker) {
        picker.update(value);
        return;
      }
      language.replaceChildren();
      const logo = options.codeLogo?.(value);
      if (logo) {
        for (const theme of ['light', 'dark'] as const) {
          const image = document.createElement('img');
          image.className = `note-code-logo note-code-logo-${theme}`;
          image.src = logo[theme];
          image.alt = '';
          image.width = 16;
          image.height = 16;
          image.draggable = false;
          language.append(image);
        }
      }
      const label = document.createElement('span');
      label.textContent = noteCodeLanguages.find((entry) => entry.value === value)?.label ?? value;
      language.append(label);
    };
    updateLanguage();
    return {
      dom,
      contentDOM,
      update(next) {
        if (next.type !== initial.type) return false;
        const languageChanged = node.attrs.params !== next.attrs.params;
        if (languageChanged || node.textContent !== next.textContent) feedback.reset();
        node = next;
        if (languageChanged) updateLanguage();
        return true;
      },
      stopEvent: (event) =>
        event.target instanceof globalThis.Node && header.contains(event.target),
      ignoreMutation: (mutation) =>
        mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
      destroy: () => {
        feedback.destroy();
        picker?.destroy();
      },
    };
  };
}
