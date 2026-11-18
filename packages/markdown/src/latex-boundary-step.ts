import type { Node, Schema } from 'prosemirror-model';
import { Step, StepResult, type Transform } from 'prosemirror-transform';

type Boundary = 'prefix' | 'suffix';
const stepType = 'tumblerLatexBoundary';

function change(from: string, to: string) {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = from.length;
  let nextEnd = to.length;
  while (end > start && nextEnd > start && from[end - 1] === to[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  return { start, end, text: to.slice(start, nextEnd) };
}

function rebase(base: string, value: string, current: string) {
  if (current === base) return value;
  if (current === value || base === value) return current;
  const edit = change(base, value);
  const remote = change(base, current);
  const offset = remote.end <= edit.start ? remote.text.length - (remote.end - remote.start) : 0;
  if (edit.end > remote.start && remote.end > edit.start) return;
  return current.slice(0, edit.start + offset) + edit.text + current.slice(edit.end + offset);
}

/** Page setup and source edits must merge over concurrent changes to other preamble lines. */
class LatexBoundaryStep extends Step {
  constructor(
    readonly boundary: Boundary,
    readonly base: string,
    readonly value: string,
  ) {
    super();
  }

  apply(document: Node) {
    if (document.attrs.format !== 'latex') return StepResult.fail('Expected a LaTeX document.');
    const merged = rebase(this.base, this.value, document.attrs[this.boundary]);
    if (merged === undefined) return StepResult.fail('The same LaTeX source changed concurrently.');
    return StepResult.ok(
      document.type.create(
        { ...document.attrs, [this.boundary]: merged },
        document.content,
        document.marks,
      ),
    );
  }

  invert(document: Node) {
    const original: string = document.attrs[this.boundary];
    return new LatexBoundaryStep(
      this.boundary,
      rebase(this.base, this.value, original) ?? original,
      original,
    );
  }

  // These strings are stored outside the editable body, so its positions do not affect them.
  map() {
    return this;
  }

  toJSON() {
    return { stepType, boundary: this.boundary, base: this.base, value: this.value };
  }

  static override fromJSON(_schema: Schema, json: unknown) {
    if (
      !json ||
      typeof json !== 'object' ||
      !('boundary' in json) ||
      (json.boundary !== 'prefix' && json.boundary !== 'suffix') ||
      !('base' in json) ||
      typeof json.base !== 'string' ||
      !('value' in json) ||
      typeof json.value !== 'string'
    )
      throw new RangeError('Invalid LaTeX boundary change.');
    return new LatexBoundaryStep(json.boundary, json.base, json.value);
  }
}

// A hot reload can re-evaluate this module while ProseMirror retains its step registry.
const registration = Symbol.for('@tumblerjs/markdown/latex-boundary-step');
const registry: typeof Step & { [registration]?: typeof LatexBoundaryStep } = Step;
const registered = registry[registration];
if (registered) {
  registered.fromJSON = LatexBoundaryStep.fromJSON;
} else {
  Step.jsonID(stepType, LatexBoundaryStep);
  registry[registration] = LatexBoundaryStep;
}

export function updateLatexBoundary<T extends Transform>(
  transform: T,
  boundary: Boundary,
  value: string,
): T {
  const base: string = transform.doc.attrs[boundary];
  if (base !== value) transform.step(new LatexBoundaryStep(boundary, base, value));
  return transform;
}
