import { describe, expect, it } from "vitest";
import { evaluateExpression } from "../evaluator";

describe("evaluateExpression", () => {
  describe("Arithmetic & Operators", () => {
    it("evaluates basic arithmetic correctly", () => {
      expect(evaluateExpression("2 + 3").value).toBe(5);
      expect(evaluateExpression("10 - 4").value).toBe(6);
      expect(evaluateExpression("6 * 7").value).toBe(42);
      expect(evaluateExpression("20 / 4").value).toBe(5);
      expect(evaluateExpression("14 % 4").value).toBe(2);
      expect(evaluateExpression("2 ^ 3").value).toBe(8);
      expect(evaluateExpression("(2 + 3) * 4").value).toBe(20);
    });

    it("evaluates comparisons and logical operations", () => {
      expect(evaluateExpression("10 > 5").value).toBe(true);
      expect(evaluateExpression("5 <= 5").value).toBe(true);
      expect(evaluateExpression("10 == 10").value).toBe(true);
      expect(evaluateExpression("10 != 5").value).toBe(true);
      expect(evaluateExpression("true && false").value).toBe(false);
      expect(evaluateExpression("true || false").value).toBe(true);
      expect(evaluateExpression("!true").value).toBe(false);
    });

    it("evaluates ternary expressions", () => {
      expect(evaluateExpression("10 > 5 ? 'yes' : 'no'").value).toBe("yes");
      expect(evaluateExpression("2 > 5 ? 100 : 200").value).toBe(200);
    });
  });

  describe("Whitelisted Functions", () => {
    it("evaluates math functions", () => {
      expect(evaluateExpression("abs(-15)").value).toBe(15);
      expect(evaluateExpression("sqrt(16)").value).toBe(4);
      expect(evaluateExpression("pow(3, 3)").value).toBe(27);
      expect(evaluateExpression("floor(4.9)").value).toBe(4);
      expect(evaluateExpression("ceil(4.1)").value).toBe(5);
      expect(evaluateExpression("round(3.14159, 2)").value).toBe(3.14);
      expect(evaluateExpression("clamp(15, 0, 10)").value).toBe(10);
      expect(evaluateExpression("clamp(-5, 0, 10)").value).toBe(0);
      expect(evaluateExpression("lerp(0, 100, 0.25)").value).toBe(25);
      expect(evaluateExpression("if(1 > 0, 42, 99)").value).toBe(42);
    });

    it("evaluates aggregation and collection functions", () => {
      expect(evaluateExpression("sum(1, 2, 3, 4)").value).toBe(10);
      expect(evaluateExpression("avg(10, 20, 30)").value).toBe(20);
      expect(evaluateExpression("min(8, 3, 12)").value).toBe(3);
      expect(evaluateExpression("max(8, 3, 12)").value).toBe(12);
      expect(evaluateExpression("count(1, 2, 3)").value).toBe(1);
    });
  });

  describe("Scope, Datasets & Variables", () => {
    it("resolves deck variables", () => {
      const scope = {
        variables: {
          rate: 0.05,
          principal: 1000,
          active: true,
        },
      };
      expect(evaluateExpression("principal * (1 + rate)", scope).value).toBe(1050);
      expect(evaluateExpression("active ? rate * 100 : 0", scope).value).toBe(5);
    });

    it("Worked Example 1: resolves dataset columns and last()", () => {
      const scope = {
        datasets: {
          adoption: {
            columns: ["year", "pct"],
            rows: [
              { year: "2023", pct: 30 },
              { year: "2024", pct: 42 },
              { year: "2025", pct: 55 },
            ],
          },
        },
      };

      // last(adoption.pct) -> 55
      expect(evaluateExpression("last(adoption.pct)", scope).value).toBe(55);
      expect(evaluateExpression("first(adoption.pct)", scope).value).toBe(30);
      expect(evaluateExpression("sum(adoption.pct)", scope).value).toBe(127);
      expect(evaluateExpression("count(adoption.pct)", scope).value).toBe(3);

      // Mutate cell to 74
      scope.datasets.adoption.rows[2].pct = 74;
      expect(evaluateExpression("last(adoption.pct)", scope).value).toBe(74);
    });

    it("Worked Example 2: computed columns with pow, growth and _i", () => {
      const scope = {
        variables: { growth: 12 },
        currentRow: { base: 100 },
        rowIndex: 2,
      };

      // expr: "base * pow(1 + growth / 100, _i)"
      const result = evaluateExpression("base * pow(1 + growth / 100, _i)", scope);
      expect(result.error).toBeUndefined();
      // 100 * (1.12)^2 = 125.44
      expect(result.value).toBeCloseTo(125.44, 2);
    });
  });

  describe("Hostile Input & Security Hardening", () => {
    it("blocks constructor and prototype pollution attacks", () => {
      const hostile1 = evaluateExpression('constructor.constructor("return process")()');
      expect(hostile1.error).toBeDefined();
      expect(hostile1.value).toBeUndefined();

      const hostile2 = evaluateExpression('__proto__.polluted = "yes"');
      expect(hostile2.error).toBeDefined();
      expect(hostile2.value).toBeUndefined();

      const hostile3 = evaluateExpression('prototype.polluted = 1');
      expect(hostile3.error).toBeDefined();
    });

    it("blocks global object lookups (window, document, process, globalThis)", () => {
      expect(evaluateExpression("window.location").error).toBeDefined();
      expect(evaluateExpression("document.cookie").error).toBeDefined();
      expect(evaluateExpression("globalThis").error).toBeDefined();
      expect(evaluateExpression("process.env").error).toBeDefined();
    });

    it("blocks computed bracket property access", () => {
      const result = evaluateExpression('adoption["pct"]', {
        datasets: { adoption: { columns: ["pct"], rows: [] } },
      });
      expect(result.error).toMatch(/bracket property access is not allowed/i);
    });

    it("blocks method calls on objects", () => {
      const result = evaluateExpression("(10).toString()");
      expect(result.error).toMatch(/Method calls on objects are not allowed/i);
    });

    it("blocks functions not in the whitelist", () => {
      const result = evaluateExpression("alert(1)");
      expect(result.error).toMatch(/not in the allowed functions whitelist/i);

      const result2 = evaluateExpression("eval('1+1')");
      expect(result2.error).toBeDefined();
    });

    it("rejects expressions exceeding maximum length", () => {
      const longExpr = "1 + ".repeat(1000) + "1";
      const result = evaluateExpression(longExpr);
      expect(result.error).toMatch(/maximum length/i);
    });

    it("handles syntax errors gracefully without throwing", () => {
      const badSyntax = evaluateExpression("1 + * 2");
      expect(badSyntax.error).toBeDefined();
      expect(badSyntax.value).toBeUndefined();
    });
  });
});
