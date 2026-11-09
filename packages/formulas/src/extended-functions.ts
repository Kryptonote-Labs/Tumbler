import type { FunctionRegistry } from "./function-runtime.ts";
import { logicalFunctions } from "./functions/logical.ts";
import { datetimeFunctions } from "./functions/datetime.ts";
import { mathFunctions } from "./functions/math.ts";
import { financialFunctions } from "./functions/financial.ts";

/** Excel extension categories included in this stack layer. */
export const extendedFunctions: FunctionRegistry = new Map([
  ...logicalFunctions,
  ...datetimeFunctions,
  ...mathFunctions,
  ...financialFunctions,
]);
