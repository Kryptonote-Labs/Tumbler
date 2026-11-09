import type { FunctionRegistry } from "./function-runtime.ts";
import { statisticalFunctions } from "./functions/statistical.ts";

export const extendedFunctions: FunctionRegistry = new Map(
  statisticalFunctions,
);
