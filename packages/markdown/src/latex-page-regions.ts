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
  const folioLeadIns = new Set<number>();
  const rectoBlanks = new Set<number>();
  const footnotes: number[] = [];
  const footHeights: number[] = [];
  const papers: LatexPageLayout[] = [];
  const shrinkages: ReturnType<typeof paginateLatex>['shrinkages'] = new Map();
  const stretches: ReturnType<typeof paginateLatex>['stretches'] = new Map();
  const discardedSpaces: ReturnType<typeof paginateLatex>['discardedSpaces'] = new Set();
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
      group.map((block) => {
        const { split } = block;
        const shifted = move(block);
        return split ? { ...shifted, split: () => split().map(move) } : shifted;
      }),
      paper.height - paper.top - paper.bottom,
      paper.top + paper.bottom + paper.gap,
      paper.leading,
    );
    breaks.push(...plan.breaks);
    for (const [position, shrink] of plan.shrinkages) shrinkages.set(position, shrink);
    for (const [position, size] of plan.stretches) {
      stretches.set(position, size);
      inserted += size;
    }
    for (const position of plan.discardedSpaces) discardedSpaces.add(position);
    for (const block of group)
      if (plan.discardedSpaces.has(block.position)) inserted -= block.discardableSpace ?? 0;
    breakSlots.push(...plan.breakSlots.map((slot) => pageOffset + slot));
    for (const position of plan.folioLeadIns) folioLeadIns.add(position);
    for (const page of plan.rectoBlanks) rectoBlanks.add(pageOffset + page);
    footnotes.push(...plan.footnotes.map((page) => pageOffset + page));
    footHeights.push(...plan.footHeights);
    for (let page = 0; page < plan.pages; page++) papers.push(paper);
    inserted += plan.breaks.reduce((total, item) => total + item.height, 0);
    pageTop += plan.pages * (paper.height + paper.gap);
  }
  return {
    breaks, breakSlots, folioLeadIns, rectoBlanks, footnotes, footHeights, pages: papers.length, papers,
    wideFloats: [], shrinkages, stretches, discardedSpaces, floatSpans: new Map<number, number>(),
  };
}
