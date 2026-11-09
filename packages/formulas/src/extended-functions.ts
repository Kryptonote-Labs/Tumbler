import type { FunctionRegistry } from "./function-runtime.ts";
import { logicalFunctions } from "./functions/logical.ts";

/** Excel extension categories included in this stack layer. */
export const extendedFunctions: FunctionRegistry = new Map([
  ...logicalFunctions,
]);
