import { describe, expect, it, vi } from "vitest";
import {
  runInsightGraph,
  type InsightGraphTools,
} from "../src/lib/agents/insight-graph";

const plan = {
  sql: "select qty from stock_balance",
  title: "库存",
  basis: "当前授权企业库存",
};
function tools(): InsightGraphTools {
  return {
    tables: ["stock_balance"],
    generate: vi.fn().mockResolvedValue(JSON.stringify(plan)),
    repairPlan: vi.fn().mockResolvedValue(JSON.stringify(plan)),
    execute: vi.fn().mockResolvedValue([{ qty: 20 }]),
    repairSql: vi.fn().mockResolvedValue(JSON.stringify(plan)),
    summarize: vi.fn().mockResolvedValue("库存为20吨。"),
  };
}

describe("LangGraph data insight workflow", () => {
  it("runs the real graph and explains actual rows", async () => {
    const t = tools();
    const result = await runInsightGraph(t);
    expect(result.workflow.steps).toEqual([
      "generate_plan",
      "validate_plan",
      "execute_query",
      "explain_result",
    ]);
    expect(result.rows).toEqual([{ qty: 20 }]);
    expect(t.summarize).toHaveBeenCalledWith(plan, [{ qty: 20 }], false);
  });
  it("takes the clarification branch without executing SQL", async () => {
    const t = tools();
    vi.mocked(t.generate).mockResolvedValue(
      JSON.stringify({ ...plan, sql: "", basis: "请说明查询目标" }),
    );
    const result = await runInsightGraph(t);
    expect(result.answer).toBe("请说明查询目标");
    expect(result.rows).toEqual([]);
    expect(t.execute).not.toHaveBeenCalled();
    expect(t.summarize).not.toHaveBeenCalled();
  });
  it("repairs plan format once via a conditional graph edge", async () => {
    const t = tools();
    vi.mocked(t.generate).mockResolvedValue("not json");
    const result = await runInsightGraph(t);
    expect(result.workflow.planRepairs).toBe(1);
    expect(
      result.workflow.steps.filter((s) => s === "validate_plan"),
    ).toHaveLength(2);
    expect(t.execute).toHaveBeenCalledTimes(1);
  });
  it("stops after one unsafe plan repair without calling the database", async () => {
    const t = tools();
    vi.mocked(t.generate).mockResolvedValue(
      JSON.stringify({ ...plan, sql: "delete from stock_balance" }),
    );
    vi.mocked(t.repairPlan).mockResolvedValue(
      JSON.stringify({ ...plan, sql: "select * from public.stock_balance" }),
    );
    await expect(runInsightGraph(t)).rejects.toThrow("SQL_PLAN_INVALID");
    expect(t.repairPlan).toHaveBeenCalledTimes(1);
    expect(t.execute).not.toHaveBeenCalled();
  });
  it("repairs a database alias error once and reruns validated SQL", async () => {
    const t = tools();
    vi.mocked(t.execute).mockRejectedValueOnce(
      Object.assign(Error("unknown column"), { code: "42703" }),
    );
    const result = await runInsightGraph(t);
    expect(result.workflow.sqlRepairs).toBe(1);
    expect(t.execute).toHaveBeenCalledTimes(2);
  });
  it.each(["42501", "57014", "08006"])(
    "never rewrites SQL for permission/timeout/connection errors: %s",
    async (code) => {
      const t = tools();
      vi.mocked(t.execute).mockRejectedValue(
        Object.assign(Error("failure"), { code }),
      );
      await expect(runInsightGraph(t)).rejects.toThrow(
        "SQL_EXECUTION_FAILED:" + code,
      );
      expect(t.repairSql).not.toHaveBeenCalled();
    },
  );
  it("does not execute an unsafe SQL repair", async () => {
    const t = tools();
    vi.mocked(t.execute).mockRejectedValue(
      Object.assign(Error("unknown column"), { code: "42703" }),
    );
    vi.mocked(t.repairSql).mockResolvedValue(
      JSON.stringify({ ...plan, sql: "select * from public.stock_balance" }),
    );
    await expect(runInsightGraph(t)).rejects.toThrow("SQL_PLAN_INVALID");
    expect(t.execute).toHaveBeenCalledTimes(1);
  });
  it("does not loop after a second database error", async () => {
    const t = tools();
    vi.mocked(t.execute).mockRejectedValue(
      Object.assign(Error("unknown column"), { code: "42703" }),
    );
    await expect(runInsightGraph(t)).rejects.toThrow(
      "SQL_EXECUTION_FAILED:42703",
    );
    expect(t.repairSql).toHaveBeenCalledTimes(1);
    expect(t.execute).toHaveBeenCalledTimes(2);
  });
  it("preserves query results if the explanatory model fails and bounds returned rows", async () => {
    const t = tools();
    vi.mocked(t.execute).mockResolvedValue(
      Array.from({ length: 201 }, (_, qty) => ({ qty })),
    );
    vi.mocked(t.summarize).mockRejectedValue(Error("provider timeout"));
    const result = await runInsightGraph(t);
    expect(result.rows).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(result.answer).toContain("超过200行");
    expect(vi.mocked(t.summarize).mock.calls[0][1]).toHaveLength(40);
  });
  it("does not treat exactly 200 rows as truncated", async () => {
    const t = tools();
    vi.mocked(t.execute).mockResolvedValue(
      Array.from({ length: 200 }, (_, qty) => ({ qty })),
    );
    expect((await runInsightGraph(t)).truncated).toBe(false);
  });
  it("does not repair provider failures or share results across simultaneous requests", async () => {
    const failed = tools();
    vi.mocked(failed.generate).mockRejectedValue(Error("provider unavailable"));
    await expect(runInsightGraph(failed)).rejects.toThrow(
      "provider unavailable",
    );
    expect(failed.repairPlan).not.toHaveBeenCalled();
    const a = tools(),
      b = tools();
    vi.mocked(b.execute).mockResolvedValue([{ qty: 99 }]);
    const results = await Promise.all([runInsightGraph(a), runInsightGraph(b)]);
    expect(results.map((r) => r.rows[0].qty)).toEqual([20, 99]);
  });
  it("does not start tools for an already cancelled request", async () => {
    const t = tools();
    await expect(runInsightGraph(t, AbortSignal.abort())).rejects.toThrow();
    expect(t.generate).not.toHaveBeenCalled();
  });
});
