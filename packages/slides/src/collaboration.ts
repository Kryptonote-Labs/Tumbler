import { diffChars } from 'diff';
import { applyPresentationCommand, type PresentationCommand } from './commands.ts';
import type { PresentationArtifact } from './artifact.ts';
import { slideTextValue } from './editing.ts';

/** A destructive overlap needs a user decision; never silently replace another author's text. */
export class PresentationRebaseConflict extends Error {}

/** Reapply an unsaved branch to a newer deck, preserving semantic targets and generated identities.
 * Independent properties merge; same-property writes follow acceptance order. Text offsets follow
 * unchanged text spans. Overlapping replacements and changed table structure stay recoverable.
 * Hosts must only rebase operations known to have been rejected, never an ambiguous write response.
 */
export function rebasePresentationCommands(
  base: PresentationArtifact,
  current: PresentationArtifact,
  commands: readonly PresentationCommand[],
  intervening: readonly PresentationCommand[],
): { commands: PresentationCommand[]; artifact: PresentationArtifact } {
  const removedSlides = new Set<string>();
  const removedObjects = new Set<string>();
  const removedTables = new Set<string>();
  const visit = (command: PresentationCommand) => {
    if (command.name === 'batch') {
      command.commands.forEach(visit);
      return;
    }
    if (command.name === 'delete-slide') removedSlides.add(command.slideId);
    if (command.name === 'delete-object')
      removedObjects.add(`${command.slideId}:${command.objectKey}`);
    if (command.name === 'edit-table') removedTables.add(`${command.slideId}:${command.objectKey}`);
    if (command.name === 'layout') {
      const slide = base.document.slides.find((s) => s.id === command.slideId);
      for (const object of slide?.objects ?? [])
        if (object.placeholder) removedObjects.add(`${command.slideId}:${object.key}`);
    }
  };
  intervening.forEach(visit);
  const slideIds = new Map<string, string>();
  const objectIds = new Map<string, string>();
  const semantic = (value: unknown) =>
    JSON.stringify(value, (key, item: unknown) =>
      key === 'elementId' || key.endsWith('ElementId') ? undefined : item,
    );
  const conflict = () => {
    throw new PresentationRebaseConflict(
      'This target changed in another window. Your local edits are retained.',
    );
  };
  const rebase = (input: PresentationCommand): PresentationCommand => {
    if (input.name === 'batch') throw new Error('Groups must be rebased sequentially.');
    if (
      'sourceId' in input &&
      input.sourceId &&
      removedSlides.has(input.sourceId) &&
      !slideIds.has(input.sourceId)
    )
      conflict();
    if (input.name === 'insert-slide' && input.sourceId && !slideIds.has(input.sourceId)) {
      const original = base.document.slides.find((slide) => slide.id === input.sourceId);
      const source = current.document.slides.find((slide) => slide.id === input.sourceId);
      if (semantic(original) !== semantic(source)) conflict();
    }
    if (input.name === 'replace-all') {
      const expanded: Exclude<PresentationCommand, { name: 'batch' }>[] = [];
      const escaped = input.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(escaped, input.caseSensitive ? 'gu' : 'giu');
      for (const slide of base.document.slides)
        for (const object of slide.objects) {
          if (!object.textEditable) continue;
          const matches = [...slideTextValue(object).matchAll(expression)];
          for (const match of matches.reverse())
            expanded.push({
              name: 'edit-text',
              slideId: slide.id,
              objectKey: object.key,
              start: match.index,
              end: match.index + match[0].length,
              value: input.value,
            });
        }
      if (!expanded.length) conflict();
      return {
        name: 'batch',
        commands: expanded.map(
          (command) => rebase(command) as Exclude<PresentationCommand, { name: 'batch' }>,
        ),
      };
    }
    let command = { ...input };
    if ('slideId' in command) command.slideId = slideIds.get(command.slideId) ?? command.slideId;
    if ('sourceId' in command && command.sourceId)
      command.sourceId = slideIds.get(command.sourceId) ?? command.sourceId;
    const inputSlideId = 'slideId' in input ? input.slideId : undefined;
    const inputObjectKey = 'objectKey' in input ? input.objectKey : undefined;
    if (inputSlideId && removedSlides.has(inputSlideId) && !slideIds.has(inputSlideId)) conflict();
    const identity = `${inputSlideId}:${inputObjectKey}`;
    if (input.name !== 'paste-object' && removedObjects.has(identity) && !objectIds.has(identity))
      conflict();
    if ('cell' in input && input.cell && removedTables.has(identity) && !objectIds.has(identity))
      conflict();
    const oldSlide = base.document.slides.find((s) => s.id === inputSlideId);
    const targetSlideId = 'slideId' in command ? command.slideId : undefined;
    const slide = current.document.slides.find((s) => s.id === targetSlideId);
    if (oldSlide && !slide) conflict();
    if ('objectKey' in command && command.name !== 'paste-object')
      command.objectKey =
        objectIds.get(`${'slideId' in input ? input.slideId : ''}:${command.objectKey}`) ??
        command.objectKey;
    const oldObject = oldSlide?.objects.find((o) => o.key === inputObjectKey);
    const targetObjectKey = 'objectKey' in command ? command.objectKey : undefined;
    const object = slide?.objects.find((o) => o.key === targetObjectKey);
    if (oldObject && !object && command.name !== 'paste-object') conflict();
    if (command.name === 'insert-slide' || command.name === 'move-slide') {
      const anchor = base.document.slides.filter(
        (s) => command.name !== 'move-slide' || s.id !== inputSlideId,
      )[command.index];
      const ordered = current.document.slides.filter(
        (s) => command.name !== 'move-slide' || s.id !== command.slideId,
      );
      command.index = anchor
        ? ordered.findIndex((s) => s.id === (slideIds.get(anchor.id) ?? anchor.id))
        : ordered.length;
      if (command.index < 0) conflict();
    }
    if (command.name === 'update-object' && oldObject && object) {
      for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const)
        if (command[key] === oldObject.transform[key])
          command = { ...command, [key]: object.transform[key] };
    }
    if (
      oldObject &&
      object &&
      'cell' in command &&
      command.cell &&
      JSON.stringify(
        oldObject.table?.cells.map((c) => [c.row, c.column, c.rowSpan, c.columnSpan]),
      ) !==
        JSON.stringify(object.table?.cells.map((c) => [c.row, c.column, c.rowSpan, c.columnSpan]))
    )
      conflict();
    if ('start' in command && oldObject && object) {
      const cell = command.cell;
      const text = (target: typeof object) =>
        cell
          ? (target.table?.cells
              .find((c) => c.row === cell.row && c.column === cell.column)
              ?.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))
              .join('\n') ?? '')
          : slideTextValue(target);
      const before = text(oldObject),
        after = text(object);
      if (before !== after) {
        const hunks: { start: number; end: number; added: number; text: string }[] = [];
        const remember = (change: (typeof hunks)[number]) => {
          // Choose the earliest equivalent insertion boundary in repeated text.
          if (change.start === change.end) {
            const lower = hunks.at(-1)?.end ?? 0;
            while (change.start > lower && before[change.start - 1] === change.text.at(-1)) {
              change.start--;
              change.end--;
              change.text = change.text.at(-1)! + change.text.slice(0, -1);
            }
          }
          hunks.push(change);
        };
        let position = 0;
        let hunk: (typeof hunks)[number] | undefined;
        for (const part of diffChars(before, after)) {
          if (!part.added && !part.removed) {
            if (hunk) remember(hunk);
            hunk = undefined;
            position += part.value.length;
          } else {
            hunk ??= { start: position, end: position, added: 0, text: '' };
            if (part.removed) {
              position += part.value.length;
              hunk.end = position;
            } else {
              hunk.added += part.value.length;
              hunk.text += part.value;
            }
          }
        }
        if (hunk) remember(hunk);
        for (const change of hunks)
          if (
            command.start < change.end &&
            command.end > change.start &&
            (command.name === 'edit-text' || change.end > change.start)
          )
            conflict();
        const offset = (value: number, right: boolean) =>
          value +
          hunks.reduce(
            (delta, change) =>
              value > change.end || (value === change.end && (right || change.end > change.start))
                ? delta + change.added - (change.end - change.start)
                : delta,
            0,
          );
        command = {
          ...command,
          start: offset(command.start, true),
          end: offset(command.end, command.start === command.end),
        };
      }
    }

    // Structural commands cannot infer intent after their own target was rewritten.
    if (
      (command.name === 'layout' || command.name === 'delete-slide') &&
      oldSlide &&
      !slideIds.has(oldSlide.id) &&
      semantic(oldSlide) !== semantic(slide)
    )
      conflict();
    if (
      (command.name === 'edit-table' ||
        command.name === 'delete-object' ||
        command.name === 'duplicate-object') &&
      oldObject &&
      !objectIds.has(`${inputSlideId}:${inputObjectKey}`) &&
      semantic(oldObject) !== semantic(object)
    )
      conflict();
    return command;
  };
  const result: PresentationCommand[] = [];
  const apply = (command: PresentationCommand): PresentationCommand => {
    // Process groups sequentially so later members can address newly inserted objects.
    if (command.name === 'batch') {
      const group = command.commands.flatMap((c) => {
        const next = apply(c);
        return next.name === 'batch' ? next.commands : [next];
      });
      return { name: 'batch' as const, commands: group };
    }
    const rebased = rebase(command);
    const old = base,
      previous = current;
    base = applyPresentationCommand(base, command);
    current = applyPresentationCommand(current, rebased);
    const added = base.document.slides.filter(
      (s) => !old.document.slides.some((o) => o.id === s.id),
    );
    const newSlides = current.document.slides.filter(
      (s) => !previous.document.slides.some((o) => o.id === s.id),
    );
    added.forEach((slide, i) => {
      if (newSlides[i]) slideIds.set(slide.id, newSlides[i]!.id);
    });
    for (const slide of base.document.slides) {
      const oldKeys = new Set(
        old.document.slides.find((s) => s.id === slide.id)?.objects.map((o) => o.key),
      );
      const target = current.document.slides.find(
        (s) => s.id === (slideIds.get(slide.id) ?? slide.id),
      );
      const previousKeys = new Set(
        previous.document.slides.find((s) => s.id === target?.id)?.objects.map((o) => o.key),
      );
      const objects = slide.objects.filter((o) => !oldKeys.has(o.key));
      const targets = target?.objects.filter((o) => !previousKeys.has(o.key)) ?? [];
      objects.forEach((object, i) => {
        if (targets[i]) objectIds.set(`${slide.id}:${object.key}`, targets[i]!.key);
      });
    }
    return rebased;
  };
  for (const command of commands) result.push(apply(command));
  return { commands: result, artifact: current };
}
