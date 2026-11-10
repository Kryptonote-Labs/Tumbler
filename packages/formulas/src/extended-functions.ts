import type { FunctionRegistry } from "./function-runtime.ts";
import { statisticalFunctions } from "./functions/statistical.ts";
import { logicalFunctions } from "./functions/logical.ts";

export const extendedFunctions: FunctionRegistry = new Map([
  ...statisticalFunctions,
  ...logicalFunctions,
]);
