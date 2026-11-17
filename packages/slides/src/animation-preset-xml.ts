import {
  normalizeEntranceAnimation,
  ENTRANCE_ANIMATIONS,
  type EntranceAnimationInput,
} from './animation.ts';
import { xml, P } from './authoring-xml.ts';

/** Expand an authored preset to real PresentationML behaviors; IDs are local to the slide. */
export function entranceAnimationXml(
  target: string,
  input: EntranceAnimationInput,
  firstId: number,
  namespace = P,
) {
  const value = normalizeEntranceAnimation(input);
  let id = firstId;
  const effectId = id++;
  const behavior = (attribute: string, duration = value.duration, extra = '') =>
    `<p:cBhvr><p:cTn id="${id++}" dur="${duration}" fill="hold" ${extra}/><p:tgtEl><p:spTgt spid="${xml(target)}"/></p:tgtEl><p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst></p:cBhvr>`;
  const visible = `<p:set>${behavior('style.visibility', 1)}<p:to><p:strVal val="visible"/></p:to></p:set>`;
  const number = (attribute: string, from: string, to: string, extra = '') =>
    `<p:anim calcmode="lin" valueType="num">${behavior(attribute, value.duration, extra)}<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${xml(from)}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${xml(to)}"/></p:val></p:tav></p:tavLst></p:anim>`;
  let contents = visible,
    subtype = 0;
  const direction = value.direction;
  const directional = new Map<string, number>(
    Object.entries({
      top: 1,
      right: 2,
      bottom: 4,
      left: 8,
      'top-right': 3,
      'bottom-right': 6,
      'bottom-left': 12,
      'top-left': 9,
    }),
  );
  if (value.kind === 'fade' || value.kind === 'float')
    contents += `<p:animEffect transition="in" filter="fade">${behavior('style.opacity')}</p:animEffect>`;
  if (value.kind === 'fly') {
    const x = direction.includes('left')
      ? '-#ppt_w/2'
      : direction.includes('right')
        ? '1+#ppt_w/2'
        : '#ppt_x';
    const y = direction.includes('top')
      ? '-#ppt_h/2'
      : direction.includes('bottom')
        ? '1+#ppt_h/2'
        : '#ppt_y';
    contents += number('ppt_x', x, '#ppt_x') + number('ppt_y', y, '#ppt_y');
    subtype = directional.get(direction) ?? 4;
  }
  if (value.kind === 'float') {
    contents += number('ppt_y', `#ppt_y${direction === 'top' ? '-' : '+'}0.1`, '#ppt_y');
    subtype = direction === 'top' ? 1 : 2;
  }
  if (value.kind === 'wipe') {
    const filter = new Map([
      ['bottom', 'up'],
      ['top', 'down'],
      ['left', 'right'],
      ['right', 'left'],
    ]);
    contents += `<p:animEffect transition="in" filter="wipe(${filter.get(direction) ?? 'up'})">${behavior('style.opacity')}</p:animEffect>`;
    subtype = directional.get(direction) ?? 4;
  }
  if (value.kind === 'split') {
    const horizontal = direction.startsWith('horizontal'),
      inward = direction.endsWith('in');
    contents += `<p:animEffect transition="in" filter="barn(${inward ? 'in' : 'out'}${horizontal ? 'Horizontal' : 'Vertical'})">${behavior('style.opacity')}</p:animEffect>`;
    subtype = horizontal ? (inward ? 26 : 42) : inward ? 21 : 37;
  }
  if (value.kind === 'zoom') {
    const from = direction === 'out' ? '2' : '0';
    contents +=
      number('ppt_w', `${from}*#ppt_w`, '#ppt_w') + number('ppt_h', `${from}*#ppt_h`, '#ppt_h');
    subtype = direction === 'out' ? 32 : 16;
  }
  const nodeType = { click: 'clickEffect', with: 'withEffect', after: 'afterEffect' }[value.start];
  const markup = `<p:par xmlns:p="${namespace}"><p:cTn id="${effectId}" presetID="${ENTRANCE_ANIMATIONS[value.kind].presetId}" presetClass="entr" presetSubtype="${subtype}" fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${value.delay}"/></p:stCondLst><p:childTnLst>${contents}</p:childTnLst></p:cTn></p:par>`;
  return { markup, nextId: id, id: String(effectId) };
}
