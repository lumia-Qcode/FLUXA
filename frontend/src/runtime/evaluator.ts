import jsep from "jsep";

// Add support for '^' exponentiation operator
try {
  jsep.addBinaryOp("^", 11);
} catch {
  // Already added if reloaded
}

export interface EvaluationScope {
  variables?: Record<string, any>;
  datasets?: Record<string, { columns: string[]; rows: Record<string, any>[] }>;
  currentRow?: Record<string, any>;
  rowIndex?: number;
}

export interface EvaluationResult {
  value: any;
  error?: string;
}

const MAX_EXPRESSION_LENGTH = 2000;
const MAX_AST_DEPTH = 30;
const MAX_STEP_COUNT = 1000;

const PROHIBITED_PROPERTIES = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "toString",
  "valueOf",
]);

// Whitelisted functions (AGENTS.md Section 4.1)
const WHITELISTED_FUNCTIONS: Record<string, (...args: any[]) => any> = {
  sum: (...args: any[]) => {
    const flat = flattenArgs(args);
    return flat.reduce((acc, v) => acc + (Number(v) || 0), 0);
  },
  avg: (...args: any[]) => {
    const flat = flattenArgs(args);
    if (flat.length === 0) return 0;
    const sum = flat.reduce((acc, v) => acc + (Number(v) || 0), 0);
    return sum / flat.length;
  },
  min: (...args: any[]) => {
    const flat = flattenArgs(args).map((v) => Number(v)).filter((v) => !isNaN(v));
    if (flat.length === 0) return 0;
    return Math.min(...flat);
  },
  max: (...args: any[]) => {
    const flat = flattenArgs(args).map((v) => Number(v)).filter((v) => !isNaN(v));
    if (flat.length === 0) return 0;
    return Math.max(...flat);
  },
  round: (val: any, decimals: any = 0) => {
    const num = Number(val);
    const d = Number(decimals) || 0;
    if (isNaN(num)) return 0;
    const factor = Math.pow(10, d);
    return Math.round(num * factor) / factor;
  },
  floor: (val: any) => {
    const num = Number(val);
    return isNaN(num) ? 0 : Math.floor(num);
  },
  ceil: (val: any) => {
    const num = Number(val);
    return isNaN(num) ? 0 : Math.ceil(num);
  },
  abs: (val: any) => {
    const num = Number(val);
    return isNaN(num) ? 0 : Math.abs(num);
  },
  sqrt: (val: any) => {
    const num = Number(val);
    return isNaN(num) || num < 0 ? 0 : Math.sqrt(num);
  },
  pow: (base: any, exp: any) => {
    const b = Number(base);
    const e = Number(exp);
    return isNaN(b) || isNaN(e) ? 0 : Math.pow(b, e);
  },
  clamp: (val: any, minVal: any, maxVal: any) => {
    const num = Number(val);
    const mn = Number(minVal);
    const mx = Number(maxVal);
    if (isNaN(num)) return mn || 0;
    return Math.min(Math.max(num, mn), mx);
  },
  lerp: (a: any, b: any, t: any) => {
    const start = Number(a) || 0;
    const end = Number(b) || 0;
    const factor = Number(t) || 0;
    return start + (end - start) * factor;
  },
  if: (cond: any, thenVal: any, elseVal: any) => {
    return cond ? thenVal : elseVal;
  },
  first: (arg: any) => {
    if (Array.isArray(arg)) return arg[0];
    return arg;
  },
  last: (arg: any) => {
    if (Array.isArray(arg)) return arg[arg.length - 1];
    return arg;
  },
  count: (arg: any) => {
    if (Array.isArray(arg)) return arg.length;
    if (arg === null || arg === undefined) return 0;
    return 1;
  },
};

function flattenArgs(args: any[]): any[] {
  const result: any[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      result.push(...a);
    } else if (a !== undefined && a !== null) {
      result.push(a);
    }
  }
  return result;
}

interface EvalState {
  steps: number;
}

function evaluateAstNode(
  node: any,
  scope: EvaluationScope,
  depth: number,
  state: EvalState
): any {
  state.steps += 1;
  if (state.steps > MAX_STEP_COUNT) {
    throw new Error("Evaluation step limit exceeded (infinite loop or complex expression).");
  }

  if (depth > MAX_AST_DEPTH) {
    throw new Error("Expression depth limit exceeded.");
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  switch (node.type) {
    case "Literal":
      return node.value;

    case "Identifier": {
      const name = node.name;
      if (PROHIBITED_PROPERTIES.has(name)) {
        throw new Error(`Access to prohibited identifier '${name}' is blocked.`);
      }

      // Built-in constants and literals
      if (name === "true") return true;
      if (name === "false") return false;
      if (name === "null") return null;
      if (name === "undefined") return undefined;
      if (name === "PI") return Math.PI;
      if (name === "E") return Math.E;

      // 1. Check currentRow properties
      if (scope.currentRow && Object.prototype.hasOwnProperty.call(scope.currentRow, name)) {
        return scope.currentRow[name];
      }

      // 2. Check rowIndex _i
      if (name === "_i") {
        return scope.rowIndex !== undefined ? scope.rowIndex : 0;
      }

      // 3. Check variables
      if (scope.variables && Object.prototype.hasOwnProperty.call(scope.variables, name)) {
        const v = scope.variables[name];
        return v && typeof v === "object" && "value" in v ? v.value : v;
      }

      // 4. Check datasets (e.g. if dataset named 'revenue' or 'adoption')
      if (scope.datasets && Object.prototype.hasOwnProperty.call(scope.datasets, name)) {
        return scope.datasets[name];
      }

      throw new Error(`Unknown identifier '${name}'.`);
    }

    case "BinaryExpression":
    case "LogicalExpression": {
      if (node.operator === "&&") {
        const left = evaluateAstNode(node.left, scope, depth + 1, state);
        return !left ? left : evaluateAstNode(node.right, scope, depth + 1, state);
      }
      if (node.operator === "||") {
        const left = evaluateAstNode(node.left, scope, depth + 1, state);
        return left ? left : evaluateAstNode(node.right, scope, depth + 1, state);
      }

      const left = evaluateAstNode(node.left, scope, depth + 1, state);
      const right = evaluateAstNode(node.right, scope, depth + 1, state);

      switch (node.operator) {
        case "+":
          return typeof left === "string" || typeof right === "string"
            ? String(left) + String(right)
            : Number(left) + Number(right);
        case "-":
          return Number(left) - Number(right);
        case "*":
          return Number(left) * Number(right);
        case "/":
          if (Number(right) === 0) return 0;
          return Number(left) / Number(right);
        case "%":
          return Number(left) % Number(right);
        case "^":
          return Math.pow(Number(left), Number(right));
        case "==":
          return left == right; // eslint-disable-line eqeqeq
        case "===":
          return left === right;
        case "!=":
          return left != right; // eslint-disable-line eqeqeq
        case "!==":
          return left !== right;
        case "<":
          return Number(left) < Number(right);
        case "<=":
          return Number(left) <= Number(right);
        case ">":
          return Number(left) > Number(right);
        case ">=":
          return Number(left) >= Number(right);
        default:
          throw new Error(`Operator '${node.operator}' is not supported.`);
      }
    }

    case "UnaryExpression": {
      const arg = evaluateAstNode(node.argument, scope, depth + 1, state);
      if (node.operator === "!") return !arg;
      if (node.operator === "-") return -Number(arg);
      if (node.operator === "+") return +Number(arg);
      throw new Error(`Unary operator '${node.operator}' is not supported.`);
    }

    case "ConditionalExpression": {
      const testVal = evaluateAstNode(node.test, scope, depth + 1, state);
      return testVal
        ? evaluateAstNode(node.consequent, scope, depth + 1, state)
        : evaluateAstNode(node.alternate, scope, depth + 1, state);
    }

    case "MemberExpression": {
      if (node.computed) {
        throw new Error("Computed bracket property access is not allowed.");
      }

      const propName = node.property.name;
      if (PROHIBITED_PROPERTIES.has(propName)) {
        throw new Error(`Access to prohibited property '${propName}' is blocked.`);
      }

      const obj = evaluateAstNode(node.object, scope, depth + 1, state);

      if (!obj || typeof obj !== "object") {
        throw new Error(`Cannot read property '${propName}' of non-object.`);
      }

      // Case A: obj is a Dataset { columns, rows }
      if (Array.isArray(obj.rows) && Array.isArray(obj.columns)) {
        // Return column values array
        if (obj.columns.includes(propName)) {
          return obj.rows.map((r: any) => r[propName]);
        }
        throw new Error(`Column '${propName}' not found in dataset.`);
      }

      // Case B: normal object property (e.g. currentRow object)
      if (Object.prototype.hasOwnProperty.call(obj, propName)) {
        return obj[propName];
      }

      throw new Error(`Property '${propName}' not found.`);
    }

    case "CallExpression": {
      // Callee MUST be a simple Identifier in the whitelist
      if (node.callee.type !== "Identifier") {
        throw new Error("Method calls on objects are not allowed.");
      }

      const fnName = node.callee.name.toLowerCase();
      const fn = WHITELISTED_FUNCTIONS[fnName];
      if (!fn) {
        throw new Error(`Function '${fnName}' is not in the allowed functions whitelist.`);
      }

      const evaluatedArgs = node.arguments.map((argNode: any) =>
        evaluateAstNode(argNode, scope, depth + 1, state)
      );

      return fn(...evaluatedArgs);
    }

    default:
      throw new Error(`Syntax element '${node.type}' is not supported.`);
  }
}

/**
 * Safely evaluates a FLUXA expression string within the given scope.
 * Never calls eval() or new Function(). Guaranteed to execute in bounded time.
 */
export function evaluateExpression(
  expression: string,
  scope: EvaluationScope = {}
): EvaluationResult {
  if (!expression || typeof expression !== "string") {
    return { value: undefined };
  }

  const clean = expression.trim();
  if (!clean) {
    return { value: undefined };
  }

  if (clean.length > MAX_EXPRESSION_LENGTH) {
    return {
      value: undefined,
      error: `Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters.`,
    };
  }

  // Check for common malicious words early
  if (
    clean.includes("constructor") ||
    clean.includes("__proto__") ||
    clean.includes("prototype") ||
    clean.includes("window") ||
    clean.includes("document") ||
    clean.includes("globalThis") ||
    clean.includes("process")
  ) {
    return {
      value: undefined,
      error: "Expression contains disallowed or hostile property keywords.",
    };
  }

  try {
    const ast = jsep(clean);
    const state: EvalState = { steps: 0 };
    const value = evaluateAstNode(ast, scope, 0, state);
    return { value };
  } catch (err: any) {
    return {
      value: undefined,
      error: err.message || "Failed to evaluate expression.",
    };
  }
}
