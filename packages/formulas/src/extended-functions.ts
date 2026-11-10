import type { FunctionRegistry } from "./function-runtime.ts";
import type { FormulaFunctionCategory } from "./function-catalog.ts";
import { statisticalFunctions } from "./functions/statistical.ts";
import { logicalFunctions } from "./functions/logical.ts";
import { datetimeFunctions } from "./functions/datetime.ts";
import { mathFunctions } from "./functions/math.ts";
import { financialFunctions } from "./functions/financial.ts";
import { engineeringFunctions } from "./functions/engineering.ts";
import { compatibilityFunctions } from "./functions/compatibility.ts";
import { textFunctions } from "./functions/text.ts";
import { lookupFunctions } from "./functions/lookup.ts";
import { informationFunctions } from "./functions/information.ts";
import { databaseFunctions } from "./functions/database.ts";
import { webFunctions } from "./functions/web.ts";
import { automationFunctions } from "./functions/automation.ts";
import { cubeFunctions } from "./functions/cube.ts";
import { specializedFunctions } from "./functions/specialized.ts";

/** Category registries in override order: a later family replaces an earlier family's handler. */
export const categoryRegistries = [
  ["statistical", statisticalFunctions],
  ["logical", logicalFunctions],
  ["date-time", datetimeFunctions],
  ["math", mathFunctions],
  ["financial", financialFunctions],
  ["engineering", engineeringFunctions],
  ["compatibility", compatibilityFunctions],
  ["text", textFunctions],
  ["lookup", lookupFunctions],
  ["information", informationFunctions],
  ["database", databaseFunctions],
  ["web", webFunctions],
  ["automation", automationFunctions],
  ["cube", cubeFunctions],
  ["specialized", specializedFunctions],
] as const satisfies readonly (readonly [FormulaFunctionCategory, FunctionRegistry])[];

export const extendedFunctions: FunctionRegistry = new Map(
  categoryRegistries.flatMap(([, registry]) => [...registry]),
);
