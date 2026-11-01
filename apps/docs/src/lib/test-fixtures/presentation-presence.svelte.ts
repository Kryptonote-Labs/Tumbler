import { mount, unmount } from 'svelte';
import { applyPresentationCommand, createPresentation } from '@tumblerjs/slides';
import { PresentationSlideView, type PresentationRemoteSelection } from '@tumblerjs/svelte/slides';

/** Real browser verification of selection publication and independently laid out remote views. */
export async function checkPresentationPresence() {
  const assert = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 100));
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  deck = applyPresentationCommand(deck, {
    name: 'insert-object',
    slideId,
    bounds: { x: 100, y: 100, width: 300, height: 180 },
    object: {
      kind: 'shape',
      text: 'First paragraph\nSecond paragraph with wrapped words and a long sentence',
    },
  });
  const shape = deck.document.slides[0]!.objects[0]!;
  deck = applyPresentationCommand(deck, {
    name: 'update-object',
    slideId,
    objectKey: shape.key,
    x: 100,
    y: 100,
    width: 300,
    height: 180,
    rotation: 25,
  });
  deck = applyPresentationCommand(deck, {
    name: 'insert-object',
    slideId,
    bounds: { x: 500, y: 100, width: 300, height: 180 },
    object: { kind: 'table', rows: 2, columns: 2 },
  });
  const table = deck.document.slides[0]!.objects[1]!;
  deck = applyPresentationCommand(deck, {
    name: 'edit-text',
    slideId,
    objectKey: table.key,
    cell: { row: 1, column: 1 },
    start: 0,
    end: 0,
    value: 'Cell content',
  });
  const emptyKeys: string[] = [];
  for (const [index, alignment] of ['center', 'end'].entries()) {
    deck = applyPresentationCommand(deck, {
      name: 'insert-object',
      slideId,
      bounds: { x: 100 + index * 400, y: 350, width: 300, height: 100 },
      object: { kind: 'shape', text: '' },
    });
    const key = deck.document.slides[0]!.objects.at(-1)!.key;
    emptyKeys.push(key);
    deck = applyPresentationCommand(deck, {
      name: 'format-text',
      slideId,
      objectKey: key,
      start: 0,
      end: 0,
      patch: { block: { horizontalAlignment: { set: alignment === 'center' ? 'center' : 'end' } } },
    });
    deck = applyPresentationCommand(deck, {
      name: 'update-object',
      slideId,
      objectKey: key,
      x: 100 + index * 400,
      y: 350,
      width: 300,
      height: 100,
      rotation: 25,
    });
  }
  const state = $state({ deck, peers: [] as PresentationRemoteSelection[], scale: 1 });
  const containers = [document.createElement('div'), document.createElement('div')];
  for (const [index, container] of containers.entries()) {
    container.style.cssText = `width:${index ? 800 : 1000}px;height:600px;position:relative`;
    document.body.append(container);
  }
  const sender = mount(PresentationSlideView, {
    target: containers[0]!,
    props: {
      get presentation() {
        return state.deck.document;
      },
      get slide() {
        return state.deck.document.slides[0]!;
      },
      editable: true,
      ontextedit: (change) => {
        state.deck = applyPresentationCommand(state.deck, { name: 'edit-text', ...change });
      },
      onselectionchange: ({ range }) => {
        state.peers = range.objectKey
          ? [
              {
                id: 'alice',
                name: 'Alice',
                color: '#176e99',
                objectKeys: [range.objectKey],
                text: range.editing
                  ? {
                      objectKey: range.objectKey,
                      start: range.start,
                      end: range.end,
                      head: range.head,
                      cell: range.cell,
                    }
                  : undefined,
              },
            ]
          : [];
      },
    },
  });
  const receiver = mount(PresentationSlideView, {
    target: containers[1]!,
    props: {
      get presentation() {
        return state.deck.document;
      },
      get slide() {
        return state.deck.document.slides[0]!;
      },
      get scale() {
        return state.scale;
      },
      get remoteSelections() {
        return state.peers;
      },
    },
  });
  try {
    await settle();
    const group = containers[0]!.querySelector<SVGGElement>('[data-slide-object]')!;
    group.focus();
    await settle();
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    const node = group.querySelector<HTMLElement>('[contenteditable="true"]');
    assert(node, 'Text editor did not activate');
    const walker = document.createTreeWalker(
      node!.querySelector('[data-text-run]')!,
      NodeFilter.SHOW_TEXT,
    );
    let text = walker.nextNode()!;
    while (!text.textContent?.length) text = walker.nextNode()!;
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 8);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await settle();
    assert(
      state.peers[0]?.text?.start === 2 && state.peers[0]?.text?.end === 8,
      'Caret movement was not published',
    );
    const overlay = containers[1]!.querySelector('.remote-selections')!;
    assert(overlay.querySelectorAll('polygon').length === 2, 'Missing object outline or caret');
    assert(overlay.textContent?.includes('Alice'), 'Remote selection lost the author name');
    const highlights = [...CSS.highlights.entries()].filter(([key]) => key.startsWith('tumbler'));
    assert(highlights.length === 1, 'Missing remote text highlight');
    assert([...highlights[0]![1]][0]?.toString() === 'rst pa', 'Wrong text highlighted');
    const caret = overlay.querySelectorAll('polygon')[1]!.getAttribute('points')!;
    const [a, b] = caret.split(' ').map((point) => point.split(',').map(Number));
    assert(Math.abs(a![0]! - b![0]!) > 1, 'Rotated text caret was drawn vertically');
    window.getSelection()!.setBaseAndExtent(text, 8, text, 2);
    document.dispatchEvent(new Event('selectionchange'));
    await settle();
    assert(state.peers[0]?.text?.head === 2, 'Backward selection lost its caret endpoint');
    for (const zoom of [0.5, 1.5, 2]) {
      state.scale = zoom;
      await settle();
      const target = containers[1]!.querySelector<SVGGElement>('[data-slide-object]')!;
      const origin = containers[1]!.querySelector('.presentation-view')!.getBoundingClientRect();
      const corner = new DOMPoint(0, 0).matrixTransform(target.getScreenCTM()!);
      const polygon = overlay.querySelector('polygon')!;
      const [left, top] = polygon.getAttribute('points')!.split(' ')[0]!.split(',').map(Number);
      assert(
        Math.abs(left! - (corner.x - origin.left)) < 1 &&
          Math.abs(top! - (corner.y - origin.top)) < 1,
        'Remote outline drifted at zoom',
      );
    }
    state.peers = [
      {
        id: 'alice',
        name: 'Alice',
        color: '#176e99',
        objectKeys: [table.key],
        text: { objectKey: table.key, cell: { row: 1, column: 1 }, start: 0, end: 4 },
      },
    ];
    await settle();
    const cellHighlights = [...CSS.highlights.entries()].filter(([key]) =>
      key.startsWith('tumbler'),
    );
    assert(
      [...cellHighlights[0]![1]][0]?.toString() === 'Cell',
      'Table selection resolved to the wrong cell',
    );
    state.peers = [
      { id: 'alice', name: 'Alice', color: '#176e99', objectKeys: [shape.key, table.key] },
    ];
    await settle();
    assert(
      overlay.querySelectorAll('polygon').length === 2,
      'Multiple object selections were lost',
    );
    state.scale = 1;
    for (const key of emptyKeys) {
      state.peers = [
        {
          id: 'alice',
          name: 'Alice',
          color: '#176e99',
          objectKeys: [key],
          text: { objectKey: key, start: 0, end: 0 },
        },
      ];
      await settle();
      const target = [...containers[1]!.querySelectorAll<SVGGElement>('[data-slide-object]')].find(
        (element) => element.dataset.slideObject === key,
      )!;
      const paragraph = target.querySelector<HTMLElement>('[data-text-paragraph]')!;
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      paragraph.insertBefore(marker, paragraph.querySelector('br'));
      const glyph = marker.getBoundingClientRect();
      marker.remove();
      const origin = containers[1]!.querySelector('.presentation-view')!.getBoundingClientRect();
      const points = overlay
        .querySelectorAll('polygon')[1]!
        .getAttribute('points')!
        .split(' ')
        .map((point) => point.split(',').map(Number));
      const cx = (points[0]![0]! + points[1]![0]!) / 2 + origin.left;
      const cy = (points[0]![1]! + points[1]![1]!) / 2 + origin.top;
      assert(
        Math.abs(cx - (glyph.left + glyph.width / 2)) < 1 &&
          Math.abs(cy - (glyph.top + glyph.height / 2)) < 1,
        'Empty aligned paragraph caret differs from native text layout',
      );
    }
    state.peers = [];
    await settle();
    assert(!overlay.querySelector('polygon'), 'Withdrawn selections remain visible');
    assert(
      ![...CSS.highlights.keys()].some((key) => key.startsWith('tumbler')),
      'Withdrawn highlights leaked',
    );
    return [
      'text selection publication',
      'rotated caret',
      'independent zoom',
      'table cell selection',
      'presence cleanup',
      'multiple object selection',
      'empty aligned and rotated carets',
    ];
  } finally {
    await unmount(sender);
    await unmount(receiver);
    containers.forEach((container) => container.remove());
  }
}
