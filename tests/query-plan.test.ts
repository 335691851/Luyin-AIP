import { describe, it, expect, vi } from "vitest";
import { generateQueryPlan, parseQueryPlan } from "../src/lib/query-plan";
const tables = ["document", "document_line", "stock_balance"];
const good = JSON.stringify({
  sql: "select sum(qty) as qty from stock_balance",
  basis: "当前授权企业库存余额",
  title: "库存",
});
describe("query plan reliability and safety", () => {
  it("accepts fenced JSON and text blocks without treating reasoning as executable SQL", () => {
    expect(
      parseQueryPlan("  \n```json\n" + good + "\n```\n", tables).title,
    ).toBe("库存");
    expect(
      parseQueryPlan(
        [
          { type: "reasoning", text: "ignore me" },
          { type: "text", text: good.slice(0, 30) },
          { type: "text", text: good.slice(30) },
        ],
        tables,
      ).title,
    ).toBe("库存");
  });
  it.each([
    '{"sql":"select qty as "数量" from stock_balance"}',
    JSON.stringify({ sql: "select qty from stock_balance" }),
    "",
    good.slice(0, 25),
  ])(
    "repairs malformed, missing or truncated plan exactly once",
    async (raw) => {
      const repair = vi.fn().mockResolvedValue(good);
      const result = await generateQueryPlan(async () => raw, repair, tables);
      expect(result.title).toBe("库存");
      expect(repair).toHaveBeenCalledTimes(1);
    },
  );
  it("does not repair a valid plan", async () => {
    const repair = vi.fn();
    await generateQueryPlan(async () => good, repair, tables);
    expect(repair).not.toHaveBeenCalled();
  });
  it("never accepts unsafe SQL after repair", async () => {
    const unsafe = JSON.stringify({
      sql: "delete from document",
      basis: "无效",
      title: "无效",
    });
    const repair = vi.fn().mockResolvedValue(unsafe);
    await expect(
      generateQueryPlan(async () => unsafe, repair, tables),
    ).rejects.toThrow("SQL_PLAN_INVALID");
    expect(repair).toHaveBeenCalledTimes(1);
  });
  it("preserves a grounded no-query clarification", () => {
    const result = parseQueryPlan(
      JSON.stringify({
        sql: "",
        basis: "ERP未提供该字段，无法查询",
        title: "资料不足",
      }),
      tables,
    );
    expect(result.sql).toBe("");
    expect(result.basis).toContain("未提供");
  });
  it("does not disguise provider/network errors as invalid plans", async () => {
    const repair = vi.fn();
    await expect(
      generateQueryPlan(
        async () => {
          throw Error("provider unavailable");
        },
        repair,
        tables,
      ),
    ).rejects.toThrow("provider unavailable");
    expect(repair).not.toHaveBeenCalled();
  });
});
import { executeQueryPlan } from "../src/lib/query-plan";
describe("execution correction boundary", () => {
  const plan = {
    sql: "select qty from stock_balance",
    basis: "库存",
    title: "库存",
  };
  it("corrects database syntax/alias failure once and returns the final executed plan", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce({ code: "42P01" })
      .mockResolvedValueOnce([{ qty: 1 }]);
    const repaired = {
      ...plan,
      sql: "select sum(qty) as qty from stock_balance",
    };
    const result = await executeQueryPlan(
      plan,
      execute,
      async () => JSON.stringify(repaired),
      tables,
    );
    expect(result.plan.sql).toBe(repaired.sql);
    expect(result.rows).toEqual([{ qty: 1 }]);
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("does not send unsafe repaired SQL to the database", async () => {
    const execute = vi.fn().mockRejectedValue({ code: "42703" });
    await expect(
      executeQueryPlan(
        plan,
        execute,
        async () =>
          JSON.stringify({ ...plan, sql: "select * from auth.users" }),
        tables,
      ),
    ).rejects.toThrow("SQL_PLAN_INVALID");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each(["42501", "57014", "CONNECTION_CLOSED"])(
    "never rewrites around privilege, timeout or connection failure %s",
    async (code) => {
      const repair = vi.fn();
      await expect(
        executeQueryPlan(
          plan,
          async () => {
            throw { code };
          },
          repair,
          tables,
        ),
      ).rejects.toThrow("SQL_EXECUTION_FAILED:" + code);
      expect(repair).not.toHaveBeenCalled();
    },
  );
});
