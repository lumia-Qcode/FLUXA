import { Dataset, Variable, Block } from "../../../shared/spec";
import { evaluateExpression, EvaluationScope } from "./evaluator";

export interface ReactiveScope {
  variables: Record<string, any>;
  datasets: Record<string, { columns: string[]; rows: Record<string, any>[] }>;
  errors: Record<string, string>;
}

/**
 * Computes all derived data:
 * 1. Resolves raw variables to values.
 * 2. Evaluates computed columns on each dataset (topological order / row-by-row).
 * 3. Returns the full scope for expression evaluation.
 */
export function buildReactiveScope(
  datasets: Record<string, Dataset> = {},
  variables: Record<string, Variable> = {}
): ReactiveScope {
  const errors: Record<string, string> = {};

  // 1. Flatten variables into plain values
  const flatVariables: Record<string, any> = {};
  for (const [varId, varDef] of Object.entries(variables)) {
    if (varDef && typeof varDef === "object") {
      flatVariables[varId] = varDef.value;
      // Also alias by label if alphanumeric identifier
      const cleanLabel = (varDef.label || "").replace(/[^a-zA-Z0-9_]/g, "");
      if (cleanLabel && !flatVariables[cleanLabel]) {
        flatVariables[cleanLabel] = varDef.value;
      }
    }
  }

  // 2. Process datasets & computed columns
  const processedDatasets: Record<string, { columns: string[]; rows: Record<string, any>[] }> = {};

  for (const [dsId, dataset] of Object.entries(datasets)) {
    if (!dataset) continue;

    const colKeys = (dataset.columns || []).map((c) => c.key);
    const computedCols = (dataset.columns || []).filter((c) => Boolean(c.expr && c.expr.trim()));

    // Clone rows to avoid mutating original store objects
    const rows = (dataset.rows || []).map((row) => ({ ...row }));

    // Evaluate computed columns row by row
    if (computedCols.length > 0) {
      rows.forEach((row, rowIndex) => {
        for (const col of computedCols) {
          const scope: EvaluationScope = {
            variables: flatVariables,
            datasets: processedDatasets,
            currentRow: row,
            rowIndex,
          };
          const res = evaluateExpression(col.expr!, scope);
          if (res.error) {
            errors[`${dsId}.${col.key}[${rowIndex}]`] = res.error;
            row[col.key] = null;
          } else {
            row[col.key] = res.value;
          }
        }
      });
    }

    processedDatasets[dsId] = {
      columns: colKeys,
      rows,
    };

    // Also register dataset by its name if alphanumeric
    const cleanName = (dataset.name || "").replace(/[^a-zA-Z0-9_]/g, "");
    if (cleanName && !processedDatasets[cleanName]) {
      processedDatasets[cleanName] = processedDatasets[dsId];
    }
  }

  return {
    variables: flatVariables,
    datasets: processedDatasets,
    errors,
  };
}

export interface ResolvedBindingResult {
  value: any;
  isBound: boolean;
  expr?: string;
  error?: string;
}

/**
 * Resolves a field that may be a primitive or a {$bind: string} expression.
 */
export function resolveBinding(
  fieldValue: any,
  scope: ReactiveScope
): ResolvedBindingResult {
  if (fieldValue && typeof fieldValue === "object" && typeof fieldValue.$bind === "string") {
    const expr = fieldValue.$bind;
    const res = evaluateExpression(expr, {
      variables: scope.variables,
      datasets: scope.datasets,
    });
    return {
      value: res.value,
      isBound: true,
      expr,
      error: res.error,
    };
  }

  return {
    value: fieldValue,
    isBound: false,
  };
}

/**
 * Resolves all bound fields of a block for display.
 */
export function resolveBlockProps(
  block: Block,
  scope: ReactiveScope
): { resolvedBlock: Block; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const clone: any = { ...block };

  if (block.type === "kpi") {
    const valRes = resolveBinding(block.value, scope);
    if (valRes.isBound) {
      if (valRes.error) {
        errors["value"] = valRes.error;
        clone.value = "Error";
      } else {
        clone.value = valRes.value;
      }
    }
    if (block.delta !== undefined) {
      const deltaRes = resolveBinding(block.delta, scope);
      if (deltaRes.isBound) {
        if (deltaRes.error) {
          errors["delta"] = deltaRes.error;
        } else {
          clone.delta = deltaRes.value;
        }
      }
    }
  } else if (block.type === "chart") {
    if (block.options) {
      clone.options = { ...block.options };
      if (block.options.min !== undefined) {
        const minRes = resolveBinding(block.options.min, scope);
        if (minRes.isBound && !minRes.error) clone.options.min = minRes.value;
      }
      if (block.options.max !== undefined) {
        const maxRes = resolveBinding(block.options.max, scope);
        if (maxRes.isBound && !maxRes.error) clone.options.max = maxRes.value;
      }
    }
  } else if (block.type === "control") {
    // If control is bound to a variable, read current value from variables
    if (block.variable && Object.prototype.hasOwnProperty.call(scope.variables, block.variable)) {
      clone._currentValue = scope.variables[block.variable];
    }
  }

  return { resolvedBlock: clone, errors };
}
