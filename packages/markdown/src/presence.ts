import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { sendableSteps } from 'prosemirror-collab';
import { Mapping, type StepMap } from 'prosemirror-transform';
import { notePresenceLabels } from './presence-labels';

export type NoteRange = { anchor: number; head: number };
export type NoteCursor = NoteRange & { id: string; name: string; color: string; focused: boolean };
export function mapNoteRange(range: NoteRange, maps: readonly StepMap[]): NoteRange {
  const mapping = new Mapping([...maps]);
  const forward = range.anchor <= range.head;
  return {
    anchor: mapping.map(range.anchor, forward ? 1 : -1),
    head: mapping.map(range.head, range.anchor === range.head ? 1 : forward ? -1 : 1),
  };
}
/** Positions crossing the wire refer to confirmed revisions, never optimistic local coordinates. */
export function noteRangeToConfirmed(state: EditorState, range: NoteRange) {
  const mapping = new Mapping(sendableSteps(state)?.steps.map((step) => step.getMap()) ?? []);
  return mapNoteRange(range, mapping.invert().maps);
}
export function noteRangeFromConfirmed(state: EditorState, range: NoteRange) {
  return mapNoteRange(range, sendableSteps(state)?.steps.map((step) => step.getMap()) ?? []);
}
/** Bounded ephemeral cursor history. Old cursor messages expire; document replay remains unbounded. */
export class NoteCursorHistory {
  private base = 0;
  private maps: StepMap[] = [];
  get version() {
    return this.base + this.maps.length;
  }
  add(from: number, maps: readonly StepMap[]) {
    if (from < this.version) maps = maps.slice(this.version - from);
    if (!maps.length) return;
    if (from > this.version) {
      this.maps = [];
      this.base = from;
    }
    this.maps.push(...maps);
    if (this.maps.length > 256) {
      const excess = this.maps.length - 256;
      this.maps.splice(0, excess);
      this.base += excess;
    }
  }
  map(from: number, to: number, range: NoteRange) {
    if (from === to) return range;
    if (from < this.base || to > this.version || from > to) return;
    return mapNoteRange(range, this.maps.slice(from - this.base, to - this.base));
  }
}
export const notePresenceKey = new PluginKey<DecorationSet>('note-presence');
export function notePresencePlugin() {
  return new Plugin<DecorationSet>({
    key: notePresenceKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, previous) {
        const cursors: NoteCursor[] | undefined = tr.getMeta(notePresenceKey);
        if (!cursors) return tr.docChanged ? previous.map(tr.mapping, tr.doc) : previous;
        const decorations: Decoration[] = [];
        for (const cursor of cursors) {
          if (
            Math.min(cursor.anchor, cursor.head) < 0 ||
            Math.max(cursor.anchor, cursor.head) > tr.doc.content.size
          )
            continue;
          if (cursor.anchor !== cursor.head)
            decorations.push(
              Decoration.inline(
                Math.min(cursor.anchor, cursor.head),
                Math.max(cursor.anchor, cursor.head),
                {
                  class: 'note-peer-selection',
                  style: `--note-peer-color:${cursor.color}`,
                },
              ),
            );
          // A caret between blocks, as when a whole object is selected, would push the page apart.
          if (!tr.doc.resolve(cursor.head).parent.inlineContent) continue;
          decorations.push(
            Decoration.widget(
              cursor.head,
              () => {
                const caret = document.createElement('span');
                caret.className = 'note-peer-caret';
                caret.classList.toggle('unfocused', !cursor.focused);
                caret.style.setProperty('--note-peer-color', cursor.color);
                caret.contentEditable = 'false';
                caret.setAttribute('aria-hidden', 'true');
                caret.dataset.peerName = cursor.name;
                return caret;
              },
              { side: 1, key: `${cursor.id}:${cursor.name}:${cursor.color}:${cursor.focused}` },
            ),
          );
        }
        return DecorationSet.create(tr.doc, decorations);
      },
    },
    props: {
      decorations(state) {
        return notePresenceKey.getState(state);
      },
    },
    view(view) {
      const labels = notePresenceLabels(view);
      return {
        update(view, previous) {
          if (
            view.state.doc !== previous.doc ||
            notePresenceKey.getState(view.state) !== notePresenceKey.getState(previous)
          )
            labels.update();
        },
        destroy: labels.destroy,
      };
    },
  });
}
export function setNoteCursors(view: EditorView, cursors: NoteCursor[]) {
  view.dispatch(view.state.tr.setMeta(notePresenceKey, cursors).setMeta('addToHistory', false));
}
