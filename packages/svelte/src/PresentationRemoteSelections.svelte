<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { PresentationSlide } from '@tumblerjs/slides';
  import type { PresentationRemoteSelection } from './presentation-presence.ts';
  import { presentationTextCaret } from './presentation-text-caret.ts';
  import { presentationTextPosition } from './presentation-text-position.ts';

  let {
    host,
    svg,
    slide,
    selections,
  }: {
    host: HTMLDivElement;
    svg: SVGSVGElement;
    slide: PresentationSlide;
    selections: readonly PresentationRemoteSelection[];
  } = $props();
  type Mark = {
    id: string;
    name: string | undefined;
    color: string;
    points: string;
    x: number;
    y: number;
    labelY?: number;
  };
  let marks = $state<Mark[]>([]);
  let size = $state({ width: 0, height: 0 });
  let highlights = new Map<string, Highlight>();
  const viewId = $props.id();
  const scope = viewId.replace(/[^a-zA-Z0-9]/g, '');
  let highlightStyle = $state('');

  function measure() {
    const origin = host.getBoundingClientRect();
    // Bound decorations to the existing scroll area, so labels cannot add scrollbars.
    const space = svg.parentElement;
    size = {
      width: space?.clientWidth ?? host.clientWidth,
      height: space?.clientHeight ?? host.clientHeight,
    };
    const x = (value: number) => value - origin.left + host.scrollLeft - host.clientLeft;
    const y = (value: number) => value - origin.top + host.scrollTop - host.clientTop;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const next: Mark[] = [];
    const groups = new Map(
      [...svg.querySelectorAll<SVGGElement>('[data-slide-object]')].map((element) => [
        element.dataset.slideObject,
        element,
      ]),
    );
    const registry = CSS.highlights;
    for (const key of highlights.keys()) registry?.delete(key);
    highlights = new Map();
    const styles: string[] = [];
    for (const [index, peer] of selections.entries()) {
      for (const key of new Set(peer.objectKeys)) {
        const object = slide.objects.find((item) => item.key === key);
        if (!object) continue;
        const group = groups.get(key);
        const transform = group?.getScreenCTM();
        if (!transform) continue;
        const width = Number(group?.dataset.objectWidth ?? object.transform.width);
        const height = Number(group?.dataset.objectHeight ?? object.transform.height);
        const corners = [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ].map(([left, top]) => new DOMPoint(left, top).matrixTransform(transform));
        const first = corners[0]!;
        next.push({
          id: `${peer.id}:${key}`,
          name: peer.text?.objectKey === key ? undefined : peer.name,
          color: peer.color,
          points: corners.map((point) => `${x(point.x)},${y(point.y)}`).join(' '),
          x: x(first.x),
          y: y(first.y),
        });
      }
      const text = peer.text;
      if (!text) continue;
      const object = slide.objects.find((item) => item.key === text.objectKey);
      const model = text.cell
        ? object?.table?.cells.find(
            (cell) => cell.row === text.cell!.row && cell.column === text.cell!.column,
          )?.text
        : object?.text;
      if (!model) continue;
      const group = groups.get(text.objectKey);
      const cell = text.cell
        ? [...(group?.querySelectorAll('[data-table-cell]') ?? [])].find(
            (element) =>
              element.getAttribute('data-table-cell') === `${text.cell!.row}:${text.cell!.column}`,
          )
        : group;
      const node = cell?.querySelector<HTMLElement>('.paragraphs');
      if (!node) continue;
      const paragraphs = model.paragraphs.map((p) => p.runs.map((run) => run.text).join(''));
      const length = paragraphs.join('\n').length;
      if (text.start > length || text.end > length) continue;
      const range = document.createRange();
      range.setStart(...presentationTextPosition(node, paragraphs, text.start));
      range.setEnd(...presentationTextPosition(node, paragraphs, text.end));
      if (registry && typeof Highlight !== 'undefined' && !range.collapsed) {
        const key = `tumbler${scope}peer${index}`;
        const highlight = new Highlight(range.cloneRange());
        registry.set(key, highlight);
        highlights.set(key, highlight);
        // CSSOM validates the colour before interpolating into a highlight rule.
        const color = document.createElement('span').style;
        color.color = peer.color;
        styles.push(
          `::highlight(${key}) { background-color: color-mix(in srgb, ${color.color || 'green'} 25%, transparent); }`,
        );
      }
      range.collapse(text.head === text.start);
      const caret = presentationTextCaret(node, range);
      if (caret)
        next.push({
          id: `${peer.id}:caret`,
          name: peer.name,
          color: peer.color,
          points: `${x(caret.start.x)},${y(caret.start.y)} ${x(caret.end.x)},${y(caret.end.y)}`,
          x: x(caret.start.x),
          y: y(caret.start.y),
        });
    }
    const labels = new Map<string, number>();
    marks = next.map((mark) => {
      if (!mark.name) return mark;
      const position = `${Math.round(mark.x / 4)}:${Math.round(mark.y / 4)}`;
      const row = labels.get(position) ?? 0;
      labels.set(position, row + 1);
      return { ...mark, labelY: Math.max(0, mark.y - 21) + row * 21 };
    });
    highlightStyle = styles.join('\n');
  }
  $effect(() => {
    const style = document.createElement('style');
    style.textContent = highlightStyle;
    document.head.append(style);
    return () => style.remove();
  });
  let queued = false;
  let disposed = false;
  function redraw() {
    if (queued || disposed) return;
    queued = true;
    void tick().then(() => {
      queued = false;
      if (!disposed) measure();
    });
  }
  $effect(() => {
    void slide;
    void selections;
    untrack(redraw);
  });
  $effect(() => {
    disposed = false;
    const observer = new ResizeObserver(redraw);
    observer.observe(host);
    observer.observe(svg);
    // Includes text autofit and zoom transforms, without observing this overlay.
    const mutations = new MutationObserver(redraw);
    mutations.observe(svg, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    document.fonts.addEventListener('loadingdone', redraw);
    host.addEventListener('scroll', redraw);
    window.addEventListener('resize', redraw);
    untrack(redraw);
    return () => {
      disposed = true;
      observer.disconnect();
      mutations.disconnect();
      document.fonts.removeEventListener('loadingdone', redraw);
      host.removeEventListener('scroll', redraw);
      window.removeEventListener('resize', redraw);
      for (const key of highlights.keys()) CSS.highlights?.delete(key);
    };
  });
</script>

<svg
  class="remote-selections"
  style:width={`${size.width}px`}
  style:height={`${size.height}px`}
  aria-hidden="true"
>
  {#each marks as mark (mark.id)}
    <polygon points={mark.points} fill="none" stroke={mark.color} stroke-width="2" />
    {#if mark.name}<foreignObject x={Math.max(0, mark.x)} y={mark.labelY} width="170" height="21">
        <span style:background={mark.color}>{mark.name}</span>
      </foreignObject>{/if}
  {/each}
</svg>

<style>
  .remote-selections {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
  }
  span {
    display: inline-block;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: white;
    padding: 2px 5px;
    border-radius: 3px;
    font:
      11px/16px system-ui,
      sans-serif;
  }
</style>
