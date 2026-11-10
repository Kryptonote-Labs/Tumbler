import { expect, test } from "bun:test";
import { observePdfPageVisibility } from "../src/pdf/page-visibility.ts";

for (const documentRoot of [false, true]) {
  test(`document scrolling recomputes its prefetch window after a height-only resize, root=${documentRoot}`, () => {
    const window = new EventTarget();
    const sizing = { clientHeight: 600 };
    const document = { documentElement: sizing, scrollingElement: sizing, defaultView: window };
    const page = { ownerDocument: document } as unknown as Element;
    const observations: {
      root: Element | Document | null | undefined;
      margin: string | undefined;
      disconnected: boolean;
    }[] = [];
    const names = ["IntersectionObserver", "ResizeObserver"] as const;
    const original = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperties(globalThis, {
      IntersectionObserver: {
        configurable: true,
        value: class {
          private entry: (typeof observations)[number];
          constructor(_callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
            this.entry = { root: options.root, margin: options.rootMargin, disconnected: false };
            observations.push(this.entry);
          }
          observe() {}
          disconnect() {
            this.entry.disconnected = true;
          }
        },
      },
      ResizeObserver: {
        configurable: true,
        value: class {
          observe() {}
          disconnect() {}
        },
      },
    });
    try {
      const dispose = observePdfPageVisibility(
        page,
        documentRoot ? (sizing as unknown as HTMLElement) : null,
        () => {},
      );
      expect(observations[0]?.root).toBeNull();
      expect(observations[0]?.margin).toBe("1200px 0px");
      sizing.clientHeight = 1800;
      window.dispatchEvent(new Event("resize"));
      expect(observations).toHaveLength(2);
      expect(observations[0]?.disconnected).toBe(true);
      expect(observations[1]?.root).toBeNull();
      expect(observations[1]?.margin).toBe("3600px 0px");
      dispose();
      expect(observations[1]?.disconnected).toBe(true);
      sizing.clientHeight = 900;
      window.dispatchEvent(new Event("resize"));
      expect(observations).toHaveLength(2);
    } finally {
      names.forEach((name, index) => {
        const descriptor = original[index];
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      });
    }
  });
}
