import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { parseQueryPlan, queryPlanText, type QueryPlan } from "../query-plan";

export type InsightRow = Record<string, unknown>;
export type InsightGraphTools = {
  tables: string[];
  generate: () => Promise<unknown>;
  repairPlan: (content: string, diagnostic: string) => Promise<unknown>;
  execute: (sql: string) => Promise<InsightRow[]>;
  repairSql: (plan: QueryPlan, diagnostic: string) => Promise<unknown>;
  summarize: (
    plan: QueryPlan,
    rows: InsightRow[],
    truncated: boolean,
  ) => Promise<string>;
};

const State = new StateSchema({
  raw: z.unknown().optional(),
  plan: z.custom<QueryPlan>().optional(),
  diagnostic: z.string().optional(),
  planRepairs: z.number(),
  sqlRepairs: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
  answer: z.string().optional(),
  truncated: z.boolean().optional(),
  steps: z.array(z.string()),
});

const repairableSqlCodes = new Set([
  "42P01",
  "42703",
  "42803",
  "42883",
  "42601",
  "42804",
]);

// Tools close over the freshly authorized request. No process-wide user state or checkpointer.
export function createInsightGraph(tools: InsightGraphTools) {
  return new StateGraph(State)
    .addNode("generate_plan", async (s) => ({
      raw: await tools.generate(),
      steps: [...s.steps, "generate_plan"],
    }))
    .addNode("validate_plan", (s) => {
      try {
        return {
          plan: parseQueryPlan(s.raw, tools.tables),
          diagnostic: "",
          steps: [...s.steps, "validate_plan"],
        };
      } catch (e) {
        if (s.planRepairs)
          throw Error(
            "SQL_PLAN_INVALID:模型查询计划在一次自动修正后仍未通过格式或安全校验，本次未执行SQL。请稍后重试。",
          );
        const diagnostic =
          e instanceof SyntaxError
            ? "JSON格式错误：必须返回完整JSON对象，SQL内双引号和换行必须正确转义"
            : e instanceof z.ZodError
              ? "查询计划缺少有效sql、basis或title字段，或字段超长"
              : e instanceof Error
                ? e.message.slice(0, 600)
                : "查询计划无效";
        return { diagnostic, steps: [...s.steps, "validate_plan"] };
      }
    })
    .addNode("repair_plan", async (s) => ({
      raw: await tools.repairPlan(
        queryPlanText(s.raw).slice(0, 16000),
        s.diagnostic!,
      ),
      planRepairs: s.planRepairs + 1,
      steps: [...s.steps, "repair_plan"],
    }))
    .addNode("clarify", (s) => ({
      answer: s.plan!.basis,
      rows: [],
      truncated: false,
      steps: [...s.steps, "clarify"],
    }))
    .addNode("execute_query", async (s) => {
      try {
        // Revalidate every attempt, including a repaired plan, before calling the scoped SQL tool.
        const plan = parseQueryPlan(JSON.stringify(s.plan), tools.tables);
        return {
          rows: await tools.execute(plan.sql),
          diagnostic: "",
          steps: [...s.steps, "execute_query"],
        };
      } catch (e) {
        const code = (e as { code?: string }).code || "unknown";
        if (s.sqlRepairs || !repairableSqlCodes.has(code))
          throw Error("SQL_EXECUTION_FAILED:" + code);
        return {
          diagnostic: e instanceof Error ? e.message.slice(0, 600) : code,
          steps: [...s.steps, "execute_query"],
        };
      }
    })
    .addNode("repair_sql", async (s) => {
      const raw = await tools.repairSql(s.plan!, s.diagnostic!);
      try {
        const plan = parseQueryPlan(raw, tools.tables);
        if (!plan.sql) throw Error("EMPTY_SQL");
        return {
          plan,
          sqlRepairs: s.sqlRepairs + 1,
          steps: [...s.steps, "repair_sql"],
        };
      } catch {
        throw Error(
          "SQL_PLAN_INVALID:数据库查询自动修正未通过格式或安全校验，本次未执行修正SQL。",
        );
      }
    })
    .addNode("explain_result", async (s) => {
      const rows = s.rows!.slice(0, 200);
      const truncated = s.rows!.length > 200;
      let answer = `${s.plan!.title}：查询返回 ${rows.length} 行${truncated ? "（结果超过200行展示上限，请缩小范围）" : ""}。`;
      if (rows.length) {
        try {
          answer =
            (await tools.summarize(
              s.plan!,
              rows.slice(0, 40),
              truncated || rows.length > 40,
            )) || answer;
        } catch {
          /* A model summary failure must not discard successfully queried data. */
        }
      }
      return { rows, truncated, answer, steps: [...s.steps, "explain_result"] };
    })
    .addEdge(START, "generate_plan")
    .addEdge("generate_plan", "validate_plan")
    .addConditionalEdges(
      "validate_plan",
      (s) =>
        s.diagnostic
          ? "repair_plan"
          : s.plan!.sql
            ? "execute_query"
            : "clarify",
      ["repair_plan", "execute_query", "clarify"],
    )
    .addEdge("repair_plan", "validate_plan")
    .addConditionalEdges(
      "execute_query",
      (s) => (s.diagnostic ? "repair_sql" : "explain_result"),
      ["repair_sql", "explain_result"],
    )
    .addEdge("repair_sql", "execute_query")
    .addEdge("clarify", END)
    .addEdge("explain_result", END)
    .compile();
}

export async function runInsightGraph(
  tools: InsightGraphTools,
  signal?: AbortSignal,
) {
  const result = await createInsightGraph(tools).invoke(
    { planRepairs: 0, sqlRepairs: 0, steps: [] },
    { signal, recursionLimit: 16, runName: "data-insight" },
  );
  signal?.throwIfAborted();
  return {
    plan: result.plan!,
    rows: result.rows!,
    answer: result.answer!,
    truncated: result.truncated!,
    workflow: {
      engine: "langgraph" as const,
      graph: "data-insight" as const,
      steps: result.steps,
      planRepairs: result.planRepairs,
      sqlRepairs: result.sqlRepairs,
    },
  };
}
