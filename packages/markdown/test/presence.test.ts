import { expect, test } from 'bun:test';
import { Window, type HTMLElement as HappyHTMLElement } from 'happy-dom';
import {
  EditorView,
  setNoteCursors,
  NoteCursorHistory,
  mapNoteRange,
  noteRangeFromConfirmed,
  noteRangeToConfirmed,
  noteState,
} from '@tumblerjs/markdown/editor';

test('presence labels escape code clipping, follow scrolling and zoom, and disappear with their editor', async () => {
  const window = new Window();
  const stylesheet = window.document.createElement('style');
  stylesheet.textContent = await Bun.file(
    Bun.resolveSync('@tumblerjs/markdown/style.css', import.meta.dir),
  ).text();
  window.document.head.append(stylesheet);
  const keys = [
    'window',
    'document',
    'Node',
    'HTMLElement',
    'MutationObserver',
    'getComputedStyle',
    'navigator',
  ] as const;
  const previous = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? window : window[key],
    });
  const frames = new Map<ReturnType<typeof window.requestAnimationFrame>, FrameRequestCallback>();
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const id = requestFrame(() => {});
    cancelFrame(id);
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  const flush = () => {
    const work = [...frames.values()];
    frames.clear();
    for (const callback of work) callback(0);
  };
  const scroller = window.document.createElement('div');
  scroller.style.overflow = 'auto';
  window.document.body.append(scroller);
  scroller.getBoundingClientRect = () => new window.DOMRect(20, 100, 500, 220);
  const host = window.document.createElement('div');
  scroller.append(host);
  const view = new EditorView(host as unknown as HTMLElement, {
    state: noteState('```typescript\nconsole.log("hello")\n```'),
    attributes: { class: 'note-content' },
    dispatchTransaction: (tr) => view.updateState(view.state.apply(tr)),
  });
  const cursor = {
    id: 'peer',
    name: 'Alexander Cowgill',
    color: '#76528b',
    anchor: 1,
    head: 1,
    focused: true,
  };
  try {
    view.dom.dataset.codeWrap = 'false';
    setNoteCursors(view, [cursor]);
    const label = window.document.querySelector<HappyHTMLElement>('.note-peer-label')!;
    expect(label.textContent).toBe(cursor.name);
    expect(window.getComputedStyle(label).position).toBe('fixed');
    // Its ancestor scrollers must no longer be able to clip the name.
    expect(scroller.contains(label)).toBe(false);
    const caret = window.document.querySelector<HappyHTMLElement>('.note-peer-caret')!;
    let x = 100;
    let y = 150;
    caret.getBoundingClientRect = () => new window.DOMRect(x, y, 2, 18);
    label.getBoundingClientRect = () => new window.DOMRect(0, 0, 110, 20);
    const pre = window.document.querySelector<HappyHTMLElement>('pre')!;
    pre.getBoundingClientRect = () => new window.DOMRect(40, 140, 400, 100);
    window.document.querySelector<HappyHTMLElement>('.note-code-block')!.getBoundingClientRect =
      () => new window.DOMRect(40, 110, 400, 150);
    flush();
    expect(label.style.left).toBe('100px');
    expect(label.style.top).toBe('130px');
    expect(label.style.visibility).toBe('visible');
    // A nested code scroller moves the caret, while the name remains outside it.
    x = 70;
    pre.dispatchEvent(new window.Event('scroll'));
    flush();
    expect(label.style.left).toBe('70px');
    x = 30;
    pre.dispatchEvent(new window.Event('scroll'));
    flush();
    expect(label.style.visibility).toBe('hidden');
    x = 150;
    y = 180;
    view.dom.dataset.codeWrap = 'true';
    host.style.zoom = '1.5';
    await Promise.resolve();
    await window.happyDOM.waitUntilComplete();
    flush();
    expect(label.style.left).toBe('150px');
    expect(label.style.top).toBe('160px');
    expect(label.style.visibility).toBe('visible');
    setNoteCursors(view, [{ ...cursor, focused: false }]);
    expect(window.document.querySelector('.note-peer-label')).toBeNull();
    setNoteCursors(view, [cursor]);
    expect(window.document.querySelectorAll('.note-peer-label')).toHaveLength(1);
    view.destroy();
    expect(window.document.querySelector('.note-peer-label')).toBeNull();
    expect(frames.size).toBe(0);
  } finally {
    if (!view.isDestroyed) view.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await window.happyDOM.close();
  }
});

test('cursor coordinates cross optimistic steps without expanding a caret into a selection', () => {
  let state = noteState('abc');
  const tr = state.tr.insertText('XX', 2);
  expect(mapNoteRange({ anchor: 2, head: 2 }, tr.mapping.maps)).toEqual({ anchor: 4, head: 4 });
  state = state.apply(tr);
  const range = { anchor: 6, head: 1 };
  const confirmed = noteRangeToConfirmed(state, range);
  expect(confirmed).toEqual({ anchor: 4, head: 1 });
  expect(noteRangeFromConfirmed(state, confirmed)).toEqual(range);
});

test('revisioned cursors rebase through insertions and deletions and reject missing history', () => {
  let state = noteState('abcdef');
  const history = new NoteCursorHistory();
  const insert = state.tr.insertText('XX', 1);
  history.add(40, insert.mapping.maps);
  state = state.apply(insert);
  const remove = state.tr.delete(3, 4);
  history.add(41, remove.mapping.maps);
  expect(history.map(40, 42, { anchor: 3, head: 5 })).toEqual({ anchor: 4, head: 6 });
  expect(history.map(40, 42, { anchor: 3, head: 3 })).toEqual({ anchor: 4, head: 4 });
  expect(history.map(39, 42, { anchor: 1, head: 1 })).toBeUndefined();
  expect(history.map(42, 43, { anchor: 1, head: 1 })).toBeUndefined();
});
