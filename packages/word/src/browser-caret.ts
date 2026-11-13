import { wordBrowserOwnsTarget } from './browser-dom.ts';
import type { NativeWordEditor } from './native-editor.ts';
import { wordBrowserCaretRect, wordBrowserSelection } from './browser-selection.ts';

/** Paint above positioned text backgrounds while keeping the browser selection and IME native. */
export class WordBrowserCaret {
  private readonly marker: HTMLSpanElement;
  private readonly observer: MutationObserver;
  private readonly resizeObserver: ResizeObserver | undefined;
  private readonly unsubscribe: () => void;
  private animation: Animation | undefined;
  private nativeStyle: { value: string; priority: string } | undefined;
  private queued = false;
  private disposed = false;
  private printing = false;
  private geometry = '';

  constructor(private readonly root: HTMLElement, editor: NativeWordEditor, private readonly enabled: () => boolean) {
    const document = root.ownerDocument;
    this.marker = document.createElement('span');
    this.marker.setAttribute('data-word-caret', '');
    this.marker.setAttribute('aria-hidden', 'true');
    this.marker.contentEditable = 'false';
    Object.assign(this.marker.style, {
      position: 'fixed', pointerEvents: 'none', userSelect: 'none',
      zIndex: '2147483647', width: '1px', padding: '0', margin: '0', border: '0',
    });
    this.unsubscribe = editor.subscribe(this.schedule);
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    // Host theme changes can live on any ancestor, outside the editable subtree.
    for (let element = root.parentElement; element; element = element.parentElement)
      this.observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(this.schedule);
    this.resizeObserver?.observe(root);
    root.addEventListener('focusin', this.schedule);
    root.addEventListener('focusout', this.schedule);
    document.addEventListener('selectionchange', this.schedule);
    document.fonts?.addEventListener('loadingdone', this.schedule);
    document.defaultView!.addEventListener('scroll', this.schedule, true);
    document.defaultView!.addEventListener('resize', this.schedule);
    document.defaultView!.addEventListener('focus', this.schedule);
    document.defaultView!.addEventListener('blur', this.hide);
    document.defaultView!.addEventListener('beforeprint', this.beforePrint);
    document.defaultView!.addEventListener('afterprint', this.afterPrint);
  }

  refresh() {
    if (this.disposed) return;
    const document = this.root.ownerDocument;
    const browser = document.getSelection();
    const selection = wordBrowserSelection(this.root);
    if (this.printing || !this.enabled() || !document.hasFocus() || !wordBrowserOwnsTarget(this.root, document.activeElement) || !wordBrowserOwnsTarget(this.root, browser?.focusNode) || !browser?.isCollapsed || !selection) {
      this.hide();
      return;
    }
    const rect = wordBrowserCaretRect(this.root, selection.focus);
    if (!rect || !this.visible(rect, browser.focusNode)) { this.hide(); return; }
    const view = document.defaultView!;
    const pixelRatio = view.devicePixelRatio || 1;
    const left = Math.round(rect.x * pixelRatio) / pixelRatio;
    const style = view.getComputedStyle(this.root);
    const focus = browser.focusNode instanceof Element ? browser.focusNode : browser.focusNode?.parentElement;
    const focusStyle = view.getComputedStyle(focus ?? this.root);
    const color = style.getPropertyValue('--tumbler-word-caret-color').trim() || focusStyle.color;
    this.marker.style.left = `${left}px`;
    this.marker.style.top = `${rect.y}px`;
    this.marker.style.height = `${rect.height}px`;
    this.marker.style.colorScheme = focusStyle.colorScheme;
    this.marker.style.color = focusStyle.color;
    this.marker.style.backgroundColor = color;
    if (!this.marker.isConnected) document.body.append(this.marker);
    if (!this.nativeStyle || this.root.style.getPropertyValue('caret-color') !== 'transparent') {
      this.nativeStyle = { value: this.root.style.getPropertyValue('caret-color'), priority: this.root.style.getPropertyPriority('caret-color') };
      this.root.style.setProperty('caret-color', 'transparent', 'important');
    }
    const geometry = `${left}/${rect.y}/${rect.height}/${selection.focus.paragraphId}/${selection.focus.offset}`;
    if (geometry !== this.geometry) {
      this.geometry = geometry;
      if (!view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.animation ??= this.marker.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.49 }, { opacity: 0, offset: 0.5 }, { opacity: 0, offset: 1 }], { duration: 1000, iterations: Infinity });
        this.animation.currentTime = 0;
      }
    }
  }

  hide = () => {
    this.marker.remove();
    this.animation?.cancel();
    this.animation = undefined;
    this.geometry = '';
    if (this.nativeStyle) {
      if (this.root.style.getPropertyValue('caret-color') === 'transparent') {
        if (this.nativeStyle.value) this.root.style.setProperty('caret-color', this.nativeStyle.value, this.nativeStyle.priority);
        else this.root.style.removeProperty('caret-color');
      }
      this.nativeStyle = undefined;
    }
  };

  destroy() {
    this.disposed = true;
    this.observer.disconnect();
    this.resizeObserver?.disconnect();
    this.unsubscribe();
    this.root.removeEventListener('focusin', this.schedule);
    this.root.removeEventListener('focusout', this.schedule);
    const document = this.root.ownerDocument;
    document.removeEventListener('selectionchange', this.schedule);
    document.fonts?.removeEventListener('loadingdone', this.schedule);
    document.defaultView!.removeEventListener('scroll', this.schedule, true);
    document.defaultView!.removeEventListener('resize', this.schedule);
    document.defaultView!.removeEventListener('focus', this.schedule);
    document.defaultView!.removeEventListener('blur', this.hide);
    document.defaultView!.removeEventListener('beforeprint', this.beforePrint);
    document.defaultView!.removeEventListener('afterprint', this.afterPrint);
    this.hide();
  }

  private beforePrint = () => { this.printing = true; this.hide(); };
  private afterPrint = () => { this.printing = false; this.schedule(); };

  private visible(rect: DOMRect, node: Node | null) {
    const view = this.root.ownerDocument.defaultView!;
    if (rect.height <= 0 || rect.bottom <= 0 || rect.top >= view.innerHeight || rect.x < 0 || rect.x >= view.innerWidth) return false;
    const hit = this.root.ownerDocument.elementFromPoint(rect.x, Math.max(0, Math.min(view.innerHeight - 1, rect.y + rect.height / 2)));
    if (hit && !this.root.contains(hit)) return false;
    for (let element = node instanceof Element ? node : node?.parentElement; element; element = element.parentElement) {
      const style = view.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX) && (rect.x < bounds.left || rect.x > bounds.right)) return false;
      if (/auto|scroll|hidden|clip/.test(style.overflowY) && (rect.bottom <= bounds.top || rect.top >= bounds.bottom)) return false;
    }
    return true;
  }

  private schedule = () => {
    if (this.queued || this.disposed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.refresh();
    });
  };
}
