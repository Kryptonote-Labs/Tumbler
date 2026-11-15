import type { NodeViewConstructor } from 'prosemirror-view';

/** Native checkboxes keep task lists operable with a keyboard and screen reader. */
export const taskItemView: NodeViewConstructor = (initial, view, getPos) => {
  let node = initial;
  const dom = document.createElement('li');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.contentEditable = 'false';
  checkbox.dataset.noteTask = '';
  const contentDOM = document.createElement('div');
  contentDOM.className = 'note-list-content';
  dom.append(checkbox, contentDOM);
  const update = () => {
    checkbox.hidden = node.attrs.checked === null;
    checkbox.checked = node.attrs.checked === true;
    checkbox.disabled = !view.editable;
    checkbox.setAttribute('aria-label', `Complete task: ${node.textContent}`);
    if (node.attrs.checked === null) dom.removeAttribute('data-checked');
    else dom.dataset.checked = String(node.attrs.checked);
  };
  checkbox.addEventListener('change', () => {
    const position = getPos();
    if (!view.editable || position === undefined) {
      update();
      return;
    }
    view.dispatch(
      view.state.tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        checked: checkbox.checked,
      }),
    );
  });
  update();
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== initial.type) return false;
      node = next;
      update();
      return true;
    },
    stopEvent: (event) => event.target === checkbox,
    ignoreMutation: (mutation) => mutation.type !== 'selection' && mutation.target === checkbox,
  };
};
