import { answerQuestion } from "@/server/question";
import { identity } from "@/server/auth";
import { can } from "@/lib/access";
import { sameOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { getSales } from "@/server/reports";
import { demoMode } from "@/server/config";
import { safeError } from "@/server/auth";
import { nominalProfit } from "@/lib/domain";
import {
  insightOwner,
  conversationHistory,
  saveInsight,
} from "@/server/insight-history";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    const input = z
      .object({
        question: z.string().trim().min(1).max(1000),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        year: z
          .string()
          .regex(/^[1-9]\d{3}$/)
          .optional(),
        company: z.string().max(200).optional(),
        conversationId: z.uuid().optional(),
        pageTitle: z.string().max(100).optional(),
      })
      .safeParse(await req.json());
    if (!input.success)
      return Response.json({ error: "问题或筛选条件无效" }, { status: 400 });
    const user = await identity();
    if (!can(user.access, "question.use"))
      return Response.json({ error: "当前角色无此操作权限" }, { status: 403 });
    if (!demoMode()) {
      const owner = await insightOwner(user);
      const history = await conversationHistory(
        input.data.conversationId,
        owner,
      );
      const answer = await answerQuestion(
        input.data.year
          ? `当前页面统计${input.data.year}自然年全年；未指定其他期间时使用此年。用户问题：${input.data.question}`
          : input.data.question,
        input.data.month,
        input.data.company,
        history,
        req.signal,
      );
      const saved = await saveInsight(
        input.data.question,
        answer,
        {
          month: input.data.month,
          year: input.data.year,
          company: input.data.company,
          pageTitle: input.data.pageTitle,
        },
        input.data.conversationId,
        owner,
      );
      return Response.json(
        { ...answer, ...saved },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const data = await getSales({
      ...(input.data.year
        ? { year: input.data.year }
        : { month: input.data.month }),
      company: input.data.company,
    });
    let metric: "qty" | "revenue" | "profit" = "revenue";
    metric = /利润|毛利/.test(input.data.question)
      ? "profit"
      : /数量|销量/.test(input.data.question)
        ? "qty"
        : "revenue";
    if (!can(user.access, metric === "profit" ? "profit.view" : "sales.view"))
      return Response.json({ error: "当前角色无该指标权限" }, { status: 403 });
    const filtered = data.rows.filter(
      (r) =>
        String(r.date).startsWith(
          input.data.year ? `${input.data.year}-` : input.data.month,
        ) &&
        (!input.data.company || r.company === input.data.company),
    );
    if (
      !demoMode() &&
      metric === "qty" &&
      filtered.some((r) => r.unit !== "吨")
    )
      return Response.json(
        { error: "计量单位尚未统一为吨，不能跨物料比较销量排名。" },
        { status: 422 },
      );
    if (metric === "profit" && filtered.some((r) => r.unitCost === null))
      return Response.json(
        { error: "有效单位成本尚未映射，不能把缺失成本按零计算利润。" },
        { status: 422 },
      );
    const groups = new Map<string, number>();
    filtered.forEach((r) => {
      const value =
        metric === "profit"
          ? Number(nominalProfit(r.revenue, r.qty, r.unitCost).profit)
          : Number(r[metric]);
      groups.set(r.product, (groups.get(r.product) || 0) + value);
    });
    const rows = [...groups]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([product, value]) => ({
        product,
        value: Number(value.toFixed(2)),
      }));
    return Response.json({
      mode: data.mode,
      metric,
      rows,
      answer: rows.length
        ? `${input.data.month}按产品汇总，${metric === "profit" ? "名义利润" : metric === "qty" ? "订单数量" : "不含税销售额"}最高的是「${rows[0].product}」。结果仅覆盖当前法人和期间筛选。`
        : "当前条件没有可统计的订单，请调整期间或法人。",
      basis:
        metric === "profit"
          ? "收入－数量×有效单位成本；不分摊费用"
          : `审核销售订单；${input.data.year ? `${input.data.year}自然年` : `${input.data.month}自然月`}；按产品汇总`,
      query:
        "预定义查询计划：按产品分组 → 指标求和 → 降序 → 前5；首版不开放自由SQL执行",
      sample: filtered.length,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("SQL_PLAN_INVALID:"))
      return Response.json({ error: e.message.slice(17) }, { status: 422 });
    if (e instanceof Error && e.message.startsWith("SQL_EXECUTION_FAILED:"))
      return Response.json(
        {
          error:
            "查询未能执行，请调整问题描述；诊断码 " + e.message.split(":")[1],
        },
        { status: 422 },
      );
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return Response.json(
        { error: "模型未生成有效查询计划，请重试或补充查询目标" },
        { status: 422 },
      );
    return safeError(e);
  }
}
