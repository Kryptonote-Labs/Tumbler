<script lang="ts">
  import { wordPointsToCssPixels as pixels, type WordLayoutLine } from '@tumblerjs/word';
  let { lines }: { lines: readonly WordLayoutLine[] } = $props();
  const boxes = $derived.by(() => {
    const groups = new Map<number, { line: WordLayoutLine; bottom: number }>();
    for (const line of lines) {
      if (!line.paragraphDecoration) continue;
      const previous = groups.get(line.paragraphElementId);
      if (previous) previous.bottom = Math.max(previous.bottom, line.y + line.height);
      else groups.set(line.paragraphElementId, { line, bottom: line.y + line.height });
    }
    return [...groups.values()].map(({ line, bottom }) => {
      const decoration = line.paragraphDecoration!;
      const borders = Object.entries(decoration.borders ?? {}).map(([side, border]) => `border-${side}:${pixels(border.widthPoints)}px ${border.style === 'single' ? 'solid' : border.style} ${border.color}`).join(';');
      return `position:absolute;pointer-events:none;box-sizing:border-box;left:${pixels(decoration.x)}px;top:${pixels(line.y)}px;width:${pixels(decoration.width)}px;height:${pixels(bottom - line.y)}px;background:${decoration.shading ?? 'transparent'};${borders}`;
    });
  });
</script>
{#each boxes as style}<div aria-hidden="true" contenteditable="false" {style}></div>{/each}
