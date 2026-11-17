import { beginLosslessXmlEdit, parseLosslessXml } from '@tumblerjs/ooxml';
import type { PresentationArtifact } from './artifact.ts';
import { editable, raw, slideById } from './authoring-slides.ts';
import { commitXml, partXml, P, xml } from './authoring-xml.ts';
import {
  animationAttribute as attr,
  animationChild as child,
  animationChildren as children,
  animationTimingIdCeiling,
} from './animation-xml.ts';
import { readSlideTiming } from './timing.ts';
import { entranceAnimationXml } from './animation-preset-xml.ts';
import {
  normalizeEntranceAnimation,
  sequenceAnimations,
  type EntranceAnimationInput,
  type SlideAnimation,
} from './animation.ts';
import type { PresentationCommand } from './commands.ts';
export type AnimationCommand = Extract<
  PresentationCommand,
  { name: 'add-animation' | 'update-animation' | 'remove-animation' | 'move-animation' }
>;

/** Authoring and import pass through the same primitive reader, avoiding a second preset runtime. */
export function authoredAnimation(
  target: string,
  input: EntranceAnimationInput,
  id: string,
): SlideAnimation {
  const value = normalizeEntranceAnimation(input),
    fragment = entranceAnimationXml(target, value, 1);
  const source = parseLosslessXml(
    new TextEncoder().encode(
      `<p:sld xmlns:p="${P}"><p:timing><p:tnLst>${fragment.markup}</p:tnLst></p:timing></p:sld>`,
    ),
  );
  const cue = readSlideTiming(source.root).animations[0]!;
  return { ...cue, id, startDelay: value.delay };
}
/** Shared model operation. Only add needs an externally allocated stable native identity. */
export function changeSlideAnimations(
  cues: readonly SlideAnimation[],
  command: AnimationCommand,
  target?: string,
  addedId?: string,
): SlideAnimation[] {
  let next = [...cues];
  if (command.name === 'add-animation') {
    if (!target || !addedId) throw new Error('Select a slide object to animate.');
    next.push(authoredAnimation(target, command.animation, addedId));
  } else {
    const index = next.findIndex((cue) => cue.id === command.animationId);
    if (index < 0) throw new Error('Animation not found.');
    const cue = next[index]!;
    if (command.name === 'update-animation') {
      if (!cue.editable)
        throw new Error('This imported animation is preserved but cannot be edited yet.');
      next[index] = authoredAnimation(cue.target, command.animation, command.animationId);
    } else if (command.name === 'remove-animation') next.splice(index, 1);
    else {
      if (command.index >= next.length) throw new RangeError('Invalid animation position.');
      next.splice(index, 1);
      next.splice(command.index, 0, cue);
    }
  }
  return sequenceAnimations(next);
}

/** Patch the main sequence while retaining effect contents, other trigger sequences and build lists. */
export function authorSlideAnimation(artifact: PresentationArtifact, command: AnimationCommand) {
  editable(artifact);
  const slide = slideById(artifact, command.slideId),
    source = partXml(artifact, slide.part);
  if (slide.animationEditingRestriction) throw new Error(slide.animationEditingRestriction);
  const p = source.root.namespaceUri;
  const timing = child(source.root, 'timing');
  const all = source.elements(p, 'cTn');
  const main = all.find((node) => attr(node, 'nodeType') === 'mainSeq');
  const mainList = child(main, 'childTnLst');
  const cues = slide.animations ?? [];
  // Reparenting event-referenced timing containers could change their meaning. Preserve them verbatim.
  if (
    timing &&
    (source.elements(p, 'tn').length ||
      all.some((node) => ['interactiveSeq', 'clickPar'].includes(attr(node, 'nodeType') ?? '')))
  )
    throw new Error('This slide uses interactive timing that cannot be reordered safely yet.');
  if (timing && !main && cues.length)
    throw new Error('This imported timing layout cannot be edited yet.');
  const object =
    command.name === 'add-animation'
      ? slide.objects.find((object) => object.key === command.objectKey && object.layer === 'slide')
      : undefined;
  if (command.name === 'add-animation' && (!object || object.restriction))
    throw new Error('Select an editable slide object.');
  let id = animationTimingIdCeiling(source.root) + 1;
  const changed =
    command.name === 'add-animation' || command.name === 'update-animation'
      ? entranceAnimationXml(
          command.name === 'add-animation'
            ? object!.shapeId
            : (cues.find((cue) => cue.id === command.animationId)?.target ?? ''),
          command.animation,
          id,
          p,
        )
      : undefined;
  if (changed) id = changed.nextId;
  const next = changeSlideAnimations(cues, command, object?.shapeId, changed?.id);
  // Updating keeps its public timing identity; newly generated primitive IDs remain globally unique.
  const replacementId = command.name === 'update-animation' ? command.animationId : changed?.id;
  const fragments = new Map<string, string>();
  for (const cue of next) {
    if (changed && cue.id === replacementId) {
      const parsed = parseLosslessXml(new TextEncoder().encode(changed.markup));
      const edit = beginLosslessXmlEdit(parsed),
        common = child(parsed.root, 'cTn')!;
      const identity = common.attributes.find((attribute) => attribute.localName === 'id')!;
      edit.setAttribute(identity, cue.id!);
      fragments.set(cue.id!, new TextDecoder().decode(edit.commit().bytes));
      continue;
    }
    const common = all.find((node) => attr(node, 'id') === cue.id);
    const container = common && source.elements().find((node) => children(node).includes(common));
    if (
      !common ||
      !container ||
      (mainList &&
        (container.span.start < mainList.span.start || container.span.end > mainList.span.end))
    )
      throw new Error(
        'This animation belongs to a separate trigger sequence and cannot be edited here.',
      );
    // Make inherited namespace declarations explicit before moving an effect wrapper.
    const declarations = new Map<string, string>();
    for (const ancestor of source.elements())
      if (ancestor.span.start <= container.span.start && ancestor.span.end >= container.span.end)
        for (const attribute of ancestor.attributes)
          if (attribute.prefix === 'xmlns' || attribute.qualified === 'xmlns')
            declarations.set(attribute.qualified, attribute.value);
    for (const attribute of container.attributes) declarations.delete(attribute.qualified);
    const fragment = raw(source, container),
      offset = container.qualified.length + 1;
    fragments.set(
      cue.id!,
      fragment.slice(0, offset) +
        [...declarations].map(([key, value]) => ` ${key}="${xml(value)}"`).join('') +
        fragment.slice(offset),
    );
  }
  let sequence = '',
    group = '';
  const close = () => {
    if (group) {
      sequence += group + '</p:childTnLst></p:cTn></p:par>';
      group = '';
    }
  };
  for (const cue of next) {
    if (!group || cue.start === 'click') {
      close();
      group = `<p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="${cue.step ? 'indefinite' : '0'}"/></p:stCondLst><p:childTnLst>`;
    }
    // The condition offset is executable timing; nodeType remains the authoring start-mode metadata.
    const fragment = parseLosslessXml(new TextEncoder().encode(fragments.get(cue.id!)!));
    const common = child(fragment.root, 'cTn')!,
      edit = beginLosslessXmlEdit(fragment);
    const conditions = child(common, 'stCondLst');
    if (conditions)
      edit.replaceElementMarkup(conditions, '<p:stCondLst><p:cond delay="0"/></p:stCondLst>');
    else
      edit.insertMarkupBefore(
        child(common, 'childTnLst')!,
        '<p:stCondLst><p:cond delay="0"/></p:stCondLst>',
      );
    group += `<p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="${cue.delay}"/></p:stCondLst><p:childTnLst>${new TextDecoder().decode(edit.commit().bytes)}</p:childTnLst></p:cTn></p:par>`;
  }
  close();
  const edit = beginLosslessXmlEdit(source);
  if (main) {
    const markup = `<p:childTnLst xmlns:p="${p}">${sequence}</p:childTnLst>`;
    if (mainList) {
      if (sequence) edit.replaceElementMarkup(mainList, markup);
      else edit.removeElement(mainList);
    } else if (sequence) edit.appendMarkup(main, markup);
  } else {
    const mainId = id++,
      rootId = id++;
    const markup = `<p:tnLst><p:par><p:cTn id="${rootId}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="${mainId}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${sequence}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>`;
    if (timing) edit.appendMarkup(timing, markup);
    else {
      const markupTiming = `<p:timing xmlns:p="${p}">${markup}</p:timing>`;
      const extension = child(source.root, 'extLst');
      if (extension) edit.insertMarkupBefore(extension, markupTiming);
      else edit.appendMarkup(source.root, markupTiming);
    }
  }
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
