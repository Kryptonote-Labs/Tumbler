import {
  latexLandscapeLayout,
  paginateLatex,
  type LatexPageLayout,
  type PageBlock,
  type PageLine,
} from './latex-layout';

export type LatexRegionBlock = PageBlock & { landscape?: number };

/** A landscape environment starts a new page and exchanges the body dimensions until it ends. */
export function paginateLatexRegions(blocks: LatexRegionBlock[], portrait: LatexPageLayout) {
  const landscape = latexLandscapeLayout(portrait);
  const groups: LatexRegionBlock[][] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if (last && last[0]!.landscape === block.landscape) last.push(block);
    else groups.push([block]);
  }

  const breaks: ReturnType<typeof paginateLatex>['breaks'] = [];
  const breakSlots: number[] = [];
  const footnotes: number[] = [];
  const footHeights: number[] = [];
  const papers: LatexPageLayout[] = [];
  let pageTop = 0;
  let inserted = 0;
  const firstTop = blocks[0]?.landscape === undefined ? portrait.top : landscape.top;
  for (const group of groups) {
    const first = group[0]!;
    const paper = first.landscape === undefined ? portrait : landscape;
    const pageOffset = papers.length;
    if (pageOffset) {
      const height = Math.max(0, pageTop + paper.top - firstTop - first.top - inserted);
      breaks.push({ position: first.landscape ?? first.position, height });
      breakSlots.push(pageOffset);
      inserted += height;
    }
    const move = <T extends PageLine>(line: T): T => ({
      ...line,
      top: line.top - first.top,
      bottom: line.bottom - first.top,
    });
    const plan = paginateLatex(
      group.map((block) => ({
        ...move(block),
        split: block.split ? () => block.split!().map(move) : undefined,
      })),
      paper.height - paper.top - paper.bottom,
      paper.top + paper.bottom + paper.gap,
      paper.leading,
    );
    breaks.push(...plan.breaks);
    breakSlots.push(...plan.breakSlots.map((slot) => pageOffset + slot));
    footnotes.push(...plan.footnotes.map((page) => pageOffset + page));
    footHeights.push(...plan.footHeights);
    for (let page = 0; page < plan.pages; page++) papers.push(paper);
    inserted += plan.breaks.reduce((total, item) => total + item.height, 0);
    pageTop += plan.pages * (paper.height + paper.gap);
  }
  return {
    breaks, breakSlots, footnotes, footHeights, pages: papers.length, papers,
    wideFloats: [], floatSpans: new Map<number, number>(),
  };
}
