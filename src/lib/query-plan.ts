import { z } from "zod";
import { validateReadQuery } from "./sql-guard";

const schema = z.object({
  sql: z.string().max(12000),
  basis: z.string().trim().min(1).max(3000),
  title: z.string().trim().min(1).max(200),
});
export type QueryPlan = z.infer<typeof schema>;

export async function executeQueryPlan<T>(
  plan: QueryPlan,
  execute: (sql: string) => Promise<T>,
  repair: (plan: QueryPlan, diagnostic: string) => Promise<unknown>,
  tables: string[],
) {
  try {
    return { plan, rows: await execute(plan.sql) };
  } catch (e) {
    const code = (e as { code?: string }).code || "unknown";
    // Never retry timeouts, denied access or connection failures as SQL rewrites.
    if (!["42P01", "42703", "42803", "42883", "42601", "42804"].includes(code))
      throw Error("SQL_EXECUTION_FAILED:" + code);
    let corrected: QueryPlan;
    const content = await repair(
      plan,
      e instanceof Error ? e.message.slice(0, 600) : code,
    );
    try {
      corrected = parseQueryPlan(content, tables);
      if (!corrected.sql) throw Error("EMPTY_SQL");
    } catch {
      throw Error(
        "SQL_PLAN_INVALID:数据库查询自动修正未通过格式或安全校验，本次未执行修正SQL。",
      );
    }
    try {
      return { plan: corrected, rows: await execute(corrected.sql) };
    } catch (error) {
      throw Error(
        "SQL_EXECUTION_FAILED:" +
          ((error as { code?: string }).code || "unknown"),
      );
    }
  }
}
export function queryPlanText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) =>
        part?.type === "text" && typeof part.text === "string" ? part.text : "",
      )
      .join("");
  return "";
}
export function parseQueryPlan(content: unknown, tables: string[]) {
  const text = queryPlanText(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const plan = schema.parse(JSON.parse(text));
  if (plan.sql.trim()) validateReadQuery(plan.sql, tables);
  return { ...plan, sql: plan.sql.trim() };
}

// Both invalid JSON/schema and unsafe SQL receive one correction, never unbounded retries.
export async function generateQueryPlan(
  generate: () => Promise<unknown>,
  repair: (content: string, error: string) => Promise<unknown>,
  tables: string[],
) {
  const content = await generate();
  try {
    return parseQueryPlan(content, tables);
  } catch (e) {
    const corrected = await repair(
      queryPlanText(content).slice(0, 16000),
      e instanceof SyntaxError
        ? "JSON格式错误：必须返回完整JSON对象，SQL内双引号和换行必须正确转义"
        : e instanceof z.ZodError
          ? "查询计划缺少有效sql、basis或title字段，或字段超长"
          : e instanceof Error
            ? e.message.slice(0, 600)
            : "查询计划无效",
    );
    try {
      return parseQueryPlan(corrected, tables);
    } catch {
      throw Error(
        "SQL_PLAN_INVALID:模型查询计划在一次自动修正后仍未通过格式或安全校验，本次未执行SQL。请稍后重试。",
      );
    }
  }
}
