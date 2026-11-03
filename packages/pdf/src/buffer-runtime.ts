import { Buffer } from "buffer";

// Fontkit and SASLprep's browser dependencies expect the portable Buffer implementation.
if (!Reflect.has(globalThis, "Buffer"))
  Object.defineProperty(globalThis, "Buffer", {
    value: Buffer,
    writable: true,
    configurable: true,
  });
