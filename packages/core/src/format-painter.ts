/** A one-shot formatting sample shared by document editors. Content never enters the sample. */
export class FormatPainter<Sample> {
  #sample: Sample | undefined;
  get armed() { return this.#sample !== undefined; }
  capture(sample: Sample) { this.#sample = structuredClone(sample); }
  cancel() { this.#sample = undefined; }
  apply(target: (sample: Sample) => void) {
    const sample = this.#sample;
    if (sample === undefined) return false;
    this.cancel();
    target(sample);
    return true;
  }
}
