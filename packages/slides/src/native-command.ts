import type { PresentationCommand } from './commands.ts';
import type { NativePresentationState, NativeSlide, NativeChange } from './native-document.ts';
import type { SlideObject, PresentationSlide } from './model.ts';
import { presentationTextTarget, slideTextValue } from './editing.ts';
import { editNativeText } from './native-text.ts';
import { nativeObjectTheme } from './native-fonts.ts';
import {
  insertNativeObject,
  moveNativeObject,
  nativeGradient,
  nativeColour,
} from './native-shape.ts';
import { editNativeTable } from './native-table.ts';
import { nativeLayoutTemplate as layoutTemplate, nativeMasterLayout } from './native-layout.ts';
import { nativePresetGeometry } from './drawing-geometry.ts';
import { insertNativeInk } from './native-ink.ts';
import {
  openPresentationNativeArchive,
  decodePresentationNativeArchive,
} from './native-archive.ts';
import { isPresentationBlock } from './native-block.ts';
import { importNativePresentation } from './native-document.ts';
import { openPresentationArtifact } from './artifact.ts';
import { validatePresentationShapeStyle } from './authoring-validation.ts';
type AtomicCommand = Exclude<PresentationCommand, { name: 'batch' | 'replace-all' }>;
export function applyNativeModelCommand(
  state: Omit<NativePresentationState, 'changes'>,
  command: AtomicCommand,
) {
  const target =
    'slideId' in command ? state.slides.find((s) => s.slide.id === command.slideId) : undefined;
  if ('slideId' in command && !target) throw new Error('Slide not found.');
  const selected =
    'objectKey' in command && command.name !== 'paste-object'
      ? target?.slide.objects.find((o) => o.key === command.objectKey)
      : undefined;
  if (
    'objectKey' in command &&
    command.name !== 'paste-object' &&
    (!selected || selected.restriction)
  )
    throw new Error(selected?.restriction ?? 'Slide object not found.');
  let counter = state.counter,
    slides = state.slides;
  const nextId = () => `native-${++counter}`;
  const patchSlide = (state: NativeSlide) => {
    slides = slides.map((s) => (s === target ? state : s));
  };
  const patchObject = (object: SlideObject) => {
    if (!target || !selected) throw new Error('Select an object.');
    patchSlide({
      ...target,
      slide: {
        ...target.slide,
        objects: target.slide.objects.map((o) => (o === selected ? object : o)),
      },
    });
  };
  const createdSlides: string[] = [],
    createdObjects: { slideId: string; keys: string[] }[] = [];
  const addObjects = (slideId: string, objects: readonly SlideObject[]) => {
    createdObjects.push({
      slideId,
      keys: objects.filter((o) => o.layer === 'slide').map((o) => o.key),
    });
  };
  switch (command.name) {
    case 'edit-text':
    case 'format-text':
    case 'paragraph': {
      const object = presentationTextTarget(selected!, command.cell);
      if (!object.textEditable || !object.text) throw new Error('This text is read-only.');
      const text = editNativeText(object.text, command);
      patchObject(
        command.cell
          ? {
              ...selected!,
              table: {
                ...selected!.table!,
                cells: selected!.table!.cells.map((c) =>
                  c.row === command.cell!.row && c.column === command.cell!.column
                    ? { ...c, text }
                    : c,
                ),
              },
            }
          : { ...selected!, text },
      );
      break;
    }
    case 'edit-table': {
      if (!selected!.table) throw new Error('Select a table.');
      const object = selected!,
        previous = object.table!,
        table = editNativeTable(previous, command);
      patchObject(
        moveNativeObject(
          { ...object, table },
          {
            name: 'update-object',
            slideId: command.slideId,
            objectKey: command.objectKey,
            ...object.transform,
            width: (object.transform.width * table.width) / previous.width,
            height: (object.transform.height * table.height) / previous.height,
          },
        ),
      );
      break;
    }
    case 'update-object':
      if (!selected!.movable) throw new Error('This object cannot be moved.');
      patchObject(moveNativeObject(selected!, command));
      break;
    case 'style-shape': {
      validatePresentationShapeStyle(selected!, command);
      if (command.cornerRadius !== undefined && selected!.geometry !== 'roundRect')
        throw new Error('Corner radius applies to rounded rectangles.');
      const size = Math.min(selected!.transform.width, selected!.transform.height);
      const gradient =
        typeof command.fill === 'object'
          ? nativeGradient(command.fill)
          : command.fill === undefined
            ? selected!.gradient
            : undefined;
      patchObject({
        ...selected!,
        fill: typeof command.fill === 'string' ? nativeColour(command.fill) : selected!.fill,
        gradient,
        pattern: command.fill === undefined ? selected!.pattern : undefined,
        pictureFill: command.fill === undefined ? selected!.pictureFill : undefined,
        stroke: command.stroke === undefined ? selected!.stroke : nativeColour(command.stroke),
        strokeWidth:
          command.strokeWidth === undefined
            ? selected!.strokeWidth
            : Math.round(command.strokeWidth * 12700) / 9525,
        cornerRadius:
          command.cornerRadius === undefined
            ? selected!.cornerRadius
            : (Math.round(Math.min(0.5, command.cornerRadius / size) * 100000) / 100000) * size,
        drawingGeometry:
          command.cornerRadius === undefined
            ? selected!.drawingGeometry
            : nativePresetGeometry(
                'roundRect',
                selected!.transform.width,
                selected!.transform.height,
                [['adj', `val ${Math.round(Math.min(0.5, command.cornerRadius / size) * 100000)}`]],
              ),
      });
      break;
    }
    case 'delete-object':
      patchSlide({
        ...target!,
        slide: { ...target!.slide, objects: target!.slide.objects.filter((o) => o !== selected) },
      });
      break;
    case 'duplicate-object': {
      const key = nextId();
      let object = { ...selected!, key, shapeId: key };
      object = moveNativeObject(object, {
        name: 'update-object',
        slideId: command.slideId,
        objectKey: key,
        ...object.transform,
        x: object.transform.x + 16,
        y: object.transform.y + 16,
      });
      patchSlide({
        ...target!,
        slide: { ...target!.slide, objects: [...target!.slide.objects, object] },
      });
      addObjects(command.slideId, [object]);
      break;
    }
    case 'insert-ink': {
      const key = nextId(),
        object = insertNativeInk(command, key, target!.slide.part);
      patchSlide({
        ...target!,
        slide: { ...target!.slide, objects: [...target!.slide.objects, object] },
      });
      addObjects(command.slideId, [object]);
      break;
    }
    case 'paste-object': {
      const bytes = Uint8Array.from(atob(command.source), (c) => c.charCodeAt(0));
      const source = isPresentationBlock(bytes)
        ? openPresentationNativeArchive(decodePresentationNativeArchive(bytes))
        : importNativePresentation(openPresentationArtifact(bytes));
      const object = source.document.slides
        .find((s) => s.id === command.sourceSlideId)
        ?.objects.find((o) => o.key === command.objectKey);
      if (!object || object.layer !== 'slide' || object.restriction)
        throw new Error('Copy an editable slide object.');
      if (source.state.conformance !== state.conformance)
        throw new Error('Clipboard objects must use the destination presentation conformance.');
      const key = nextId(),
        copy = { ...object, key, shapeId: key, sourcePart: target!.slide.part };
      patchSlide({
        ...target!,
        slide: { ...target!.slide, objects: [...target!.slide.objects, copy] },
      });
      addObjects(command.slideId, [copy]);
      break;
    }
    case 'insert-object': {
      const key = nextId(),
        object = nativeObjectTheme(
          insertNativeObject(command, key, key, target!.slide.part),
          target!.themeFonts,
        );
      patchSlide({
        ...target!,
        slide: { ...target!.slide, objects: [...target!.slide.objects, object] },
      });
      addObjects(command.slideId, [object]);
      break;
    }
    case 'set-slide-hidden':
      patchSlide({ ...target!, slide: { ...target!.slide, hidden: command.hidden } });
      break;
    case 'delete-slide':
      if (slides.length <= 1) throw new Error('Keep at least one slide.');
      slides = slides.filter((s) => s !== target);
      break;
    case 'move-slide': {
      if (command.index >= slides.length) throw new RangeError('Invalid slide position.');
      const order = slides.filter((s) => s !== target);
      order.splice(command.index, 0, target!);
      slides = order;
      break;
    }
    case 'insert-slide': {
      if (command.index > slides.length) throw new RangeError('Invalid slide position.');
      const donorId = command.sourceId ?? command.layoutSourceId;
      const donor = donorId
        ? slides.find((s) => s.slide.id === donorId)
        : slides[Math.max(0, command.index - 1)];
      if ((command.sourceId || command.layoutSourceId) && !donor)
        throw new Error('Source slide not found.');
      const source = command.sourceId
        ? donor
        : donor?.insertionIsTitle
          ? (donor.layoutContext?.titleInsertion ?? donor.insertion)
          : donor?.insertion;
      const id = nextId(),
        template = source?.slide ?? layoutTemplate('blank', state.width, state.height);
      const part = `/native/${id}.xml`,
        objects = template.objects.map((o) => ({
          ...o,
          key: nextId(),
          shapeId: command.sourceId ? o.shapeId : `native-${counter}`,
          sourcePart: o.layer === 'slide' ? part : o.sourcePart,
        }));
      const slide = {
        ...template,
        id,
        part,
        notes: command.sourceId ? '' : template.notes,
        objects,
      };
      const next = {
        ...source,
        slide,
        insertion: command.sourceId ? donor?.insertion : source,
        insertionIsTitle: command.sourceId ? donor?.insertionIsTitle : false,
        insertionLayout: command.sourceId ? donor?.insertionLayout : undefined,
        layoutContext: donor?.layoutContext,
        themeFonts: source?.themeFonts ?? donor?.themeFonts,
        palette: source?.palette ?? donor?.palette ?? [],
        inheritedBackground: source?.inheritedBackground ??
          donor?.inheritedBackground ?? {
            background: '#FFFFFF',
            backgroundGradient: undefined,
          },
      };
      const order = [...slides];
      order.splice(command.index, 0, next);
      slides = order;
      if (!command.sourceId)
        slides = nativeMasterLayout(slides, donor?.layoutContext, donor?.insertionLayout);
      createdSlides.push(id);
      addObjects(id, objects);
      break;
    }
    case 'layout': {
      const compiled = target!.layoutContext?.authored[command.layout];
      const template = compiled?.slide ?? layoutTemplate(command.layout, state.width, state.height),
        placeholders = target!.slide.objects.filter(
          (o) => o.layer === 'slide' && o.placeholder && o.textEditable,
        ),
        used = new Set<SlideObject>();
      const title = (s: string) => s === 'title' || s === 'ctrTitle';
      const objects = template.objects
        .filter((o) => o.layer === 'slide')
        .map((o) => {
          const match = placeholders.find(
            (p) => !used.has(p) && title(p.placeholder!) === title(o.placeholder!),
          );
          if (match) used.add(match);
          const key = match?.key ?? nextId();
          return {
            ...o,
            key,
            shapeId: match?.shapeId ?? key,
            sourcePart: target!.slide.part,
            text: match?.text ? { ...o.text!, paragraphs: match.text.paragraphs } : o.text,
          };
        });
      const kept = target!.slide.objects.filter(
        (o) =>
          o.layer === 'slide' && (!placeholders.includes(o) || used.has(o) || !!slideTextValue(o)),
      );
      const inherited = template.objects.filter((o) => o.layer !== 'slide');
      const replacements = new Map(objects.map((object) => [object.key, object]));
      const originalKeys = new Set(target!.slide.objects.map((object) => object.key));
      const changedObjects = [
        ...inherited,
        ...kept.map((object) => replacements.get(object.key) ?? object),
        ...objects.filter((object) => !originalKeys.has(object.key)),
      ];
      const insertion =
        command.layout === 'title' ? target!.layoutContext?.titleInsertion : compiled;
      patchSlide({
        ...target!,
        slide: {
          ...target!.slide,
          ...(!target!.backgroundOverride && compiled ? compiled.inheritedBackground : {}),
          objects: changedObjects,
        },
        inheritedBackground: compiled?.inheritedBackground ?? target!.inheritedBackground,
        insertion,
        insertionIsTitle: command.layout === 'title',
        insertionLayout: undefined,
      });
      slides = nativeMasterLayout(slides, target!.layoutContext, command.layout);
      addObjects(
        command.slideId,
        objects.filter((o) => !target!.slide.objects.some((p) => p.key === o.key)),
      );
      break;
    }
    case 'arrange': {
      const object = selected!,
        t = object.transform;
      if (['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(command.action))
        return applyNativeModelCommand(state, {
          name: 'update-object',
          slideId: command.slideId,
          objectKey: command.objectKey,
          ...t,
          x:
            command.action === 'left'
              ? 0
              : command.action === 'center'
                ? (state.width - t.width) / 2
                : command.action === 'right'
                  ? state.width - t.width
                  : t.x,
          y:
            command.action === 'top'
              ? 0
              : command.action === 'middle'
                ? (state.height - t.height) / 2
                : command.action === 'bottom'
                  ? state.height - t.height
                  : t.y,
        });
      const list = [...target!.slide.objects],
        at = list.indexOf(object);
      list.splice(at, 1);
      const index =
        command.action === 'front'
          ? list.length
          : command.action === 'back'
            ? 0
            : command.action === 'forward'
              ? Math.min(at + 1, list.length)
              : Math.max(at - 1, 0);
      list.splice(index, 0, object);
      patchSlide({ ...target!, slide: { ...target!.slide, objects: list } });
      break;
    }
    case 'background':
    case 'set-background': {
      const fill =
        command.name === 'background'
          ? { kind: 'solid' as const, color: command.color }
          : command.fill;
      let slide = {
        ...target!.slide,
        backgroundGradient: undefined as PresentationSlide['backgroundGradient'],
        backgroundPattern: undefined,
        backgroundPicture: undefined,
      } as PresentationSlide;
      if (fill.kind === 'inherit') slide = { ...slide, ...target!.inheritedBackground };
      if (fill.kind === 'solid')
        slide = { ...slide, background: nativeColour(fill.color, fill.opacity ?? 1) };
      if (fill.kind === 'gradient')
        slide = { ...slide, background: 'none', backgroundGradient: nativeGradient(fill) };
      if (fill.kind === 'pattern')
        slide = {
          ...slide,
          background: 'none',
          backgroundPattern: {
            preset: fill.preset,
            foreground: nativeColour(fill.foreground),
            background: nativeColour(fill.background),
          },
        };
      if (fill.kind === 'picture')
        slide = {
          ...slide,
          background: 'none',
          backgroundPicture: {
            bytes: Uint8Array.from(atob(fill.data), (c) => c.charCodeAt(0)),
            contentType: fill.contentType,
            crop: fill.crop ?? [0, 0, 0, 0],
            opacity: fill.opacity ?? 1,
            ...(fill.tile
              ? {
                  tile: {
                    ...fill.tile,
                    x: fill.tile.x ?? 0,
                    y: fill.tile.y ?? 0,
                    align: fill.tile.align ?? 'tl',
                    flip: fill.tile.flip ?? 'none',
                  },
                }
              : {}),
          },
        };
      patchSlide({ ...target!, slide, backgroundOverride: fill.kind !== 'inherit' });
      break;
    }
    default: {
      const exhaustive: never = command;
      throw new Error(`Unsupported native command: ${exhaustive}`);
    }
  }

  return {
    state: { ...state, slides, counter },
    change: {
      command,
      createdSlides,
      createdObjects,
      before: state.revisionKey,
    } satisfies NativeChange,
  };
}
