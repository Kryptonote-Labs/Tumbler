import type { PdfSearchIndex } from '@tumblerjs/pdf';

/** Host-owned find state. The visible PDF component supplies its current index. */
export class PdfSearchState {
  open = $state(false);
  query = $state('');
  matchCase = $state(false);
  wholeWord = $state(false);
  active = $state(0);
  source = $state<(() => PdfSearchIndex) | undefined>();
  result = $derived(this.open && this.query.trim() && this.source
    ? this.source().find(this.query, { matchCase: this.matchCase, wholeWord: this.wholeWord })
    : { matches: [], total: 0 });
  activeMatch = $derived(this.result.matches[this.active]);
  move(direction: number) {
    if (this.result.total) this.active = (this.active + direction + this.result.total) % this.result.total;
  }
  replace(value: string, all = false) {
    return this.source?.().replace(all ? this.result.matches : this.activeMatch ? [this.activeMatch] : [], value) ?? 0;
  }
}
