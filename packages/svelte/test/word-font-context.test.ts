import { expect, test } from 'bun:test';
import { createWordArtifact, openWordArtifact } from '@tumblerjs/word';
import type { WordViewLayout } from '../src/word-view-state.ts';
import { wordClient } from './helpers/word-client.ts';

test('document aliases reach canvas, DOM, baseline probes and reflow without stale font completions', async () => {
  const client = await wordClient();
  const seen: string[] = [];
  const layouts: WordViewLayout[] = [];
  const spans: HTMLElement[] = [];
  const create = document.createElement.bind(document);
  document.createElement = ((tag: string) => {
    const element = create(tag);
    if (tag === 'span') spans.push(element);
    if (tag === 'canvas') Object.defineProperty(element, 'getContext', { value: () => ({
      font: '', direction: 'ltr', measureText(this: { font: string }, text: string) {
        seen.push(this.font);
        return { width: text.length * 500, fontBoundingBoxAscent: 800, fontBoundingBoxDescent: 200 };
      },
    }) });
    return element;
  }) as typeof document.createElement;
  const model = (text: string) => openWordArtifact(createWordArtifact({ defaultFormat: { fontFamily: 'Example', fontSizePoints: 12 }, blocks: [{ kind: 'paragraph', runs: [{ text }] }] }).bytes()).document;
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const target = create('div');
  document.body.append(target);
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(predicate()).toBe(true);
  };
  let view: ReturnType<typeof client.mount> | undefined;
  try {
    view = client.mount(client.Harness, { target, props: { initial: model('First '.repeat(2000)), fonts: { family: () => '"PrivateFirst", serif', ready: first.promise }, onlayoutchange: layout => layouts.push(layout) } });
    client.flushSync();
    await waitFor(() => seen.some(font => font.includes('1000px "PrivateFirst"')));
    await waitFor(() => layouts.at(-1)?.complete === true);
    expect(layouts.some(layout => !layout.complete)).toBe(true);
    expect(spans.some(span => span.style.font.includes('PrivateFirst') && span.style.font.includes('16px'))).toBe(true);
    expect(target.querySelector<HTMLElement>('[data-start]')?.style.fontFamily).toContain('PrivateFirst');
    const replacement = model('Second');
    const replacedAt = layouts.length;
    view.setDocument(replacement, { family: () => '"PrivateSecond", serif', ready: second.promise });
    client.flushSync();
    await waitFor(() => seen.some(font => font.includes('PrivateSecond')));
    await waitFor(() => layouts.at(-1)?.document === replacement && layouts.at(-1)?.complete === true);
    seen.length = 0;
    first.resolve();
    await Promise.resolve();
    client.flushSync();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(seen).toEqual([]);
    second.resolve();
    await Promise.resolve();
    client.flushSync();
    await waitFor(() => seen.some(font => font.includes('PrivateSecond')));
    await waitFor(() => layouts.at(-1)?.complete === true);
    expect(layouts.slice(replacedAt).every(layout => layout.document === replacement)).toBe(true);
    expect(target.querySelector<HTMLElement>('[data-start]')?.style.fontFamily).toContain('PrivateSecond');
  } finally {
    if (view) await client.unmount(view);
    await client.dispose();
  }
});
