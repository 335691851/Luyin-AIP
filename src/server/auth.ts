import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { demoMode } from "./config";
import { appDb, erpDb } from "./db";
import { previewSession } from "./local-access";
import { companies } from "@/lib/demo";
import { permissionLabels } from "@/lib/access";
import type { AccessSession, Permission } from "@/lib/access";
export async function authClient() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("AUTH_NOT_CONFIGURED");
  return createServerClient(url, key, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        }),
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) =>
        items.forEach(({ name, value, options }) =>
          jar.set(name, value, options),
        ),
    },
  });
}
export const identity = cache(async function identity() {
  if (demoMode()) {
    const access = await previewSession();
    return {
      id: access.user.id,
      name: access.user.name,
      admin: access.permissions.includes("admin.manage"),
      companyIds: access.companies.map((c) => companies.indexOf(c) + 1),
      access,
    };
  }
  const client = await authClient();
  // Verify JWT signature/expiry through Supabase JWKS; memberships below remain fresh DB reads.
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  const issuer = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")}/auth/v1`;
  if (
    error ||
    !claims?.sub ||
    claims.iss !== issuer ||
    !(
      claims.aud === "authenticated" ||
      (Array.isArray(claims.aud) && claims.aud.includes("authenticated"))
    )
  )
    throw new Error("UNAUTHORIZED");
  const verifiedUser = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  };
  const memberships =
    await appDb()`select m.company_id,m.role,r.name as role_name,r.description,r.permissions,
      p.display_name,p.home_company_id,p.scope,p.department
      from platform.membership m
      join platform.user_profile p on p.user_id=m.user_id and p.role_id=m.role
      join platform.role r on r.id=m.role
      where m.user_id=${verifiedUser.id} and m.enabled=true and p.enabled=true and r.enabled=true`;
  if (!memberships.length || new Set(memberships.map((m) => m.role)).size !== 1)
    throw new Error("FORBIDDEN");
  const permissions = [
    ...new Set(
      memberships.flatMap((m) =>
        (m.permissions as string[]).filter((p): p is Permission =>
          Object.hasOwn(permissionLabels, p),
        ),
      ),
    ),
  ];
  const ids = memberships.map((m) => Number(m.company_id));
  const names =
    await erpDb()`select id,name from public.company where id=any(${ids}::int[]) order by id`;
  const role = {
    id: String(memberships[0].role),
    name: String(memberships[0].role_name),
    description: String(memberships[0].description),
    permissions,
  };
  const access: AccessSession = {
    demo: false,
    preview: false,
    user: {
      id: verifiedUser.id,
      name: String(memberships[0].display_name),
      email: verifiedUser.email ?? "",
      company: String(
        names.find(
          (n) => Number(n.id) === Number(memberships[0].home_company_id),
        )?.name || "",
      ),
      department: String(memberships[0].department),
      scope: memberships[0].scope as "group" | "company" | "department",
      roleId: role.id,
      enabled: true,
    },
    role,
    companies: names.map((n) => String(n.name)),
    permissions,
  };
  return {
    id: verifiedUser.id,
    name: access.user.name,
    admin: permissions.includes("admin.manage"),
    companyIds: ids,
    access,
  };
});
export function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const known: Record<string, [number, string]> = {
    INSIGHT_NOT_FOUND: [404, "会话不存在或当前权限已变化，请新建会话"],
    INSIGHT_RESULT_TOO_LARGE: [422, "查询结果过大，请缩小字段或数据范围后重试"],
    ONTORAG_NOT_CONFIGURED: [503, "OntoRAG服务地址或密钥尚未配置"],
    ONTORAG_UNAVAILABLE: [502, "OntoRAG读取失败，请检查后台连接状态后重试"],
    GRAPH_INVALID_INPUT: [400, "图谱范围或实体标识无效"],
    GRAPH_NOT_FOUND: [404, "未在所选制度范围内找到该文档或实体"],
    GRAPH_DOCUMENT_NOT_READY: [409, "该制度尚未完成抽取，或本体版本不匹配"],
    GRAPH_TOO_LARGE: [422, "图谱超过在线范围上限，请选择单份制度查看"],
    GRAPH_REQUIRES_REAL_LOGIN: [
      403,
      "知识图谱需真实登录后查看，请关闭本地样例模式",
    ],
    DEPARTMENT_MAPPING_REQUIRED: [
      422,
      "ERP部门授权字段尚未映射，不能查询部门数据",
    ],
    INVALID_REPORT_PERIOD: [400, "请选择有效的自然月或自然年期间"],
    REPORT_SCOPE_TOO_LARGE: [
      422,
      "该期间订单行超过在线明细上限，请缩小法人范围；未返回截断数据",
    ],
    UNAUTHORIZED: [401, "请登录后使用"],
    FORBIDDEN: [403, "当前角色或数据范围无此权限"],
    AUTH_NOT_CONFIGURED: [503, "Supabase身份服务尚未配置"],
    ERP_DATABASE_NOT_CONFIGURED: [503, "ERP只读数据库尚未配置"],
    APP_DATABASE_NOT_CONFIGURED: [503, "平台业务数据库尚未配置"],
    PRICE_ASSESSMENT_STALE: [409, "申请或评估已更新，请刷新后重新评估"],
    PRICE_ASSESSMENT_EMPTY: [502, "模型未返回有效调价评估，请稍后重试"],
  };
  const [status, message] = known[code] ?? [
    500,
    "服务暂不可用，请检查配置或联系管理员",
  ];
  return Response.json({ error: message }, { status });
}
