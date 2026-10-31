import { applyPresentationCommand, type PresentationCommand } from './commands.ts';
import type { PresentationArtifact } from './artifact.ts';
import { slideTextValue } from './editing.ts';

/** A destructive overlap needs a user decision; never silently replace another author's text. */
export class PresentationRebaseConflict extends Error {}

/** Reapply an unsaved branch to a newer deck, preserving semantic targets and generated identities.
 * Independent properties merge; same-property writes follow acceptance order. Text offsets follow
 * the unchanged prefix/suffix. Overlapping replacements and changed table structure stay recoverable.
 * Hosts must only rebase operations known to have been rejected, never an ambiguous write response.
 */
export function rebasePresentationCommands(
  base: PresentationArtifact,
  current: PresentationArtifact,
  commands: readonly PresentationCommand[],
): { commands: PresentationCommand[]; artifact: PresentationArtifact } {
  const slideIds = new Map<string, string>();
  const objectIds = new Map<string, string>();
  const conflict = () => { throw new PresentationRebaseConflict('This target changed in another window. Your local edits are retained.'); };
  const rebase = (input: PresentationCommand): PresentationCommand => {
    if (input.name === 'batch') throw new Error('Groups must be rebased sequentially.');
    let command = { ...input };
    if ('slideId' in command) command.slideId = slideIds.get(command.slideId) ?? command.slideId;
    if ('sourceId' in command && command.sourceId) command.sourceId = slideIds.get(command.sourceId) ?? command.sourceId;
    const inputSlideId = 'slideId' in input ? input.slideId : undefined;
    const inputObjectKey = 'objectKey' in input ? input.objectKey : undefined;
    const oldSlide = base.document.slides.find(s => s.id === inputSlideId);
    const targetSlideId = 'slideId' in command ? command.slideId : undefined;
    const slide = current.document.slides.find(s => s.id === targetSlideId);
    if (oldSlide && !slide) conflict();
    if ('objectKey' in command && command.name !== 'paste-object') command.objectKey = objectIds.get(`${'slideId' in input ? input.slideId : ''}:${command.objectKey}`) ?? command.objectKey;
    const oldObject = oldSlide?.objects.find(o => o.key === inputObjectKey);
    const targetObjectKey = 'objectKey' in command ? command.objectKey : undefined;
    const object = slide?.objects.find(o => o.key === targetObjectKey);
    if (oldObject && !object && command.name !== 'paste-object') conflict();
    if (command.name === 'insert-slide' || command.name === 'move-slide') {
      const anchor = base.document.slides.filter(s => command.name !== 'move-slide' || s.id !== inputSlideId)[command.index];
      const ordered = current.document.slides.filter(s => command.name !== 'move-slide' || s.id !== command.slideId);
      command.index = anchor ? ordered.findIndex(s => s.id === (slideIds.get(anchor.id) ?? anchor.id)) : ordered.length;
      if (command.index < 0) conflict();
    }
    if (command.name === 'update-object' && oldObject && object) {
      for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const)
        if (command[key] === oldObject.transform[key]) command = { ...command, [key]: object.transform[key] };
    }
    if (oldObject && object && 'cell' in command && command.cell && JSON.stringify(oldObject.table?.cells.map(c => [c.row, c.column, c.rowSpan, c.columnSpan])) !== JSON.stringify(object.table?.cells.map(c => [c.row, c.column, c.rowSpan, c.columnSpan]))) conflict();
    if ('start' in command && oldObject && object) {
      const cell = command.cell;
      const text = (target: typeof object) => cell
        ? target.table?.cells.find(c => c.row === cell.row && c.column === cell.column)?.text?.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n') ?? ''
        : slideTextValue(target);
      const before = text(oldObject), after = text(object);
      if (before !== after) {
        let start = 0, end = before.length, nextEnd = after.length;
        while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
        while (start < end && start < nextEnd && before[start] === after[start]) start++;
        if (command.start < end && command.end > start) conflict();
        const delta = nextEnd - end;
        const offset = (value: number) => value >= end ? value + delta : value;
        command = { ...command, start: offset(command.start), end: offset(command.end) };
      }
    }
    // Structural commands cannot infer intent after their own target was rewritten.
    if ((command.name === 'layout' || command.name === 'delete-slide') && oldSlide && JSON.stringify(oldSlide) !== JSON.stringify(slide)) conflict();
    if ((command.name === 'edit-table' || command.name === 'delete-object') && oldObject && JSON.stringify(oldObject) !== JSON.stringify(object)) conflict();
    return command;
  };
  const result: PresentationCommand[] = [];
  const apply = (command: PresentationCommand): PresentationCommand => {
    // Process groups sequentially so later members can address newly inserted objects.
    if (command.name === 'batch') {
      const group = command.commands.map(c => apply(c) as Exclude<PresentationCommand, { name: 'batch' }>);
      return { name: 'batch' as const, commands: group };
    }
    const rebased = rebase(command);
    const old = base, previous = current;
    base = applyPresentationCommand(base, command);
    current = applyPresentationCommand(current, rebased);
    const added = base.document.slides.filter(s => !old.document.slides.some(o => o.id === s.id));
    const newSlides = current.document.slides.filter(s => !previous.document.slides.some(o => o.id === s.id));
    added.forEach((slide, i) => { if (newSlides[i]) slideIds.set(slide.id, newSlides[i]!.id); });
    for (const slide of base.document.slides) {
      const oldKeys = new Set(old.document.slides.find(s => s.id === slide.id)?.objects.map(o => o.key));
      const target = current.document.slides.find(s => s.id === (slideIds.get(slide.id) ?? slide.id));
      const previousKeys = new Set(previous.document.slides.find(s => s.id === target?.id)?.objects.map(o => o.key));
      const objects = slide.objects.filter(o => !oldKeys.has(o.key));
      const targets = target?.objects.filter(o => !previousKeys.has(o.key)) ?? [];
      objects.forEach((object, i) => { if (targets[i]) objectIds.set(`${slide.id}:${object.key}`, targets[i]!.key); });
    }
    return rebased;
  };
  for (const command of commands) result.push(apply(command));
  return { commands: result, artifact: current };
}
