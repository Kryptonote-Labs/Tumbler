import type { FunctionRegistry } from "./function-runtime.ts";
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

/** Excel extension categories included in this stack layer. */
export const extendedFunctions: FunctionRegistry = new Map([
  ...logicalFunctions,
  ...datetimeFunctions,
  ...mathFunctions,
  ...financialFunctions,
  ...engineeringFunctions,
  ...compatibilityFunctions,
  ...textFunctions,
  ...lookupFunctions,
  ...informationFunctions,
  ...databaseFunctions,
  ...webFunctions,
  ...automationFunctions,
  ...cubeFunctions,
  ...specializedFunctions,
]);
