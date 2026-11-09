import type { FunctionRegistry } from "./function-runtime.ts";
import { logicalFunctions } from "./functions/logical.ts";
import { datetimeFunctions } from "./functions/datetime.ts";

/** Excel extension categories included in this stack layer. */
export const extendedFunctions: FunctionRegistry = new Map([
  ...logicalFunctions,
  ...datetimeFunctions,
]);
