import { ChatOpenAI } from "@langchain/openai";
import { identity, safeError } from "@/server/auth";
import { erpDb, appDb } from "@/server/db";
import { sameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    const user = await identity();
    if (!user.admin) throw Error("FORBIDDEN");
    const { service } = await request.json();
    const required: Record<string, string[]> = {
      ERP数据库: ["ERP_READONLY_DATABASE_URL"],
      平台数据库: ["APP_DATABASE_URL"],
      "DeepSeek Flash": ["DEEPSEEK_API_KEY"],
      OntoRAG: ["ONTORAG_BASE_URL", "ONTORAG_SERVICE_API_KEY"],
    };
    if (!Object.hasOwn(required, service))
      return Response.json({ error: "该服务不支持独立检测" }, { status: 400 });
    const started = Date.now();
    if (required[service].some((key) => !process.env[key]))
      return Response.json({
        state: "unconfigured",
        detail: "服务端连接配置尚未填写",
        checkedAt: new Date().toISOString(),
        durationMs: 0,
      });
    let detail = "";
    try {
      if (service === "ERP数据库" || service === "平台数据库") {
        const db = service === "ERP数据库" ? erpDb() : appDb();
        const tables =
          service === "ERP数据库"
            ? [
                "public.document",
                "public.document_line",
                "public.material",
                "public.company",
              ]
            : [
                "platform.membership",
                "platform.user_profile",
                "platform.role",
                "platform.access_audit",
              ];
        const missing = await db.begin(async (tx) => {
          await tx`set transaction read only`;
          await tx`set local statement_timeout='5000'`;
          const absent: string[] = [];
          for (const table of tables) {
            const [row] = await tx`select to_regclass(${table})::text as name`;
            if (!row.name) absent.push(table);
            else await tx`select 1 from ${tx(table)} limit 0`;
          }
          return absent;
        });
        detail = missing.length
          ? `数据库可连接，但缺少必需表：${missing.join("、")}`
          : "数据库连接与基础表读取权限验证通过";
        if (missing.length)
          return Response.json({
            state: "incomplete",
            detail,
            checkedAt: new Date().toISOString(),
            durationMs: Date.now() - started,
          });
      } else if (service === "DeepSeek Flash") {
        const model = new ChatOpenAI({
          apiKey: process.env.DEEPSEEK_API_KEY,
          model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
          configuration: {
            baseURL:
              process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
          },
          useResponsesApi: false,
          timeout: 15000,
          maxRetries: 0,
          maxTokens: 64,
          modelKwargs: { thinking: { type: "disabled" } },
        });
        const result = await model.invoke("Reply with OK.");
        if (
          !result.content ||
          (typeof result.content === "string" && !result.content.trim())
        )
          throw Error("EMPTY_MODEL_RESPONSE");
        detail = "LangChain已收到模型真实响应；本次仅检测连接，不涉及业务数据";
      } else {
        const url = new URL(
          "v1/documents",
          process.env.ONTORAG_BASE_URL!.replace(/\/?$/, "/"),
        );
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${process.env.ONTORAG_SERVICE_API_KEY}`,
          },
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        });
        if (!response.ok) throw Error("KNOWLEDGE_CONNECTION_FAILED");
        await response.json();
        detail = "知识文档API鉴权与响应验证通过；MCP工具与文档隔离仍需独立验收";
      }
      return Response.json({
        state: "passed",
        detail,
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      });
    } catch {
      return Response.json({
        state: "failed",
        detail: "实际连接检测失败，请检查地址、凭证、网络与读取权限",
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      });
    }
  } catch (error) {
    return safeError(error);
  }
}
