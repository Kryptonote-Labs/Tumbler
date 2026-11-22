import type { Node, Schema } from 'prosemirror-model';
import { Step, StepResult, type Transform } from 'prosemirror-transform';
import { isLatexProjectPath, type LatexProject } from './latex-project';

const stepType = 'tumblerLatexProjectFile';

function fileSource(project: LatexProject, path: string): string | null {
  return Object.hasOwn(project.files, path) ? project.files[path]! : null;
}

/** Keep edits to distinct detached files independent when collaborative steps are rebased. */
export class LatexProjectFileStep extends Step {
  constructor(
    readonly path: string,
    readonly before: string | null,
    readonly after: string | null,
    readonly retaining = false,
  ) {
    super();
  }

  apply(document: Node) {
    const project: LatexProject | null = document.attrs.latexProject;
    if (!project || this.path === project.entry) return StepResult.fail('Expected a LaTeX project file.');
    const current = fileSource(project, this.path);
    if (current === this.after) return StepResult.ok(document);
    if (current !== this.before) return StepResult.fail('The same LaTeX project file changed concurrently.');
    const files = this.after === null
      ? { ...project.files }
      : { ...project.files, [this.path]: this.after };
    if (this.after === null) delete files[this.path];
    return StepResult.ok(document.type.create({
      ...document.attrs, latexProject: { entry: project.entry, files },
    }, document.content, document.marks));
  }

  invert(document: Node) {
    return new LatexProjectFileStep(this.path, this.after, fileSource(document.attrs.latexProject, this.path));
  }

  map() {
    return this;
  }

  toJSON() {
    return { stepType, path: this.path, before: this.before, after: this.after, retaining: this.retaining };
  }

  static override fromJSON(_schema: Schema, value: unknown) {
    if (!value || typeof value !== 'object' ||
        !('path' in value) || typeof value.path !== 'string' || !isLatexProjectPath(value.path) ||
        !('before' in value) || (value.before !== null && typeof value.before !== 'string') ||
        !('after' in value) || (value.after !== null && typeof value.after !== 'string'))
      throw new RangeError('Invalid LaTeX project file change.');
    return new LatexProjectFileStep(value.path, value.before, value.after, 'retaining' in value && value.retaining === true);
  }
}

const registration = Symbol.for('@tumblerjs/markdown/latex-project-file-step');
const registry: typeof Step & { [registration]?: typeof LatexProjectFileStep } = Step;
const registered = registry[registration];
if (registered) registered.fromJSON = LatexProjectFileStep.fromJSON;
else {
  Step.jsonID(stepType, LatexProjectFileStep);
  registry[registration] = LatexProjectFileStep;
}

export function updateLatexProjectFile(transform: Transform, path: string, source: string | null, retaining = false) {
  const project: LatexProject | null = transform.doc.attrs.latexProject;
  if (!project) return;
  const before = fileSource(project, path);
  if (before !== source) transform.step(new LatexProjectFileStep(path, before, source, retaining));
}
