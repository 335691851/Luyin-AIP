import { z } from "zod";
import { identity, safeError } from "@/server/auth";
import { appDb, erpDb } from "@/server/db";
import { can } from "@/lib/access";
import { sameOrigin } from "@/lib/request-origin";
import {
  governanceCategories,
  nextGovernanceStatus,
} from "@/lib/governance-workflow";
export const runtime = "nodejs";
export const maxDuration = 60;
async function scope(view: string, company: string) {
  const u = await identity();
  if (!can(u.access, "governance.view")) throw Error("FORBIDDEN");
  if (view === "group" && u.access.user.scope !== "group")
    throw Error("FORBIDDEN");
  if (view !== "group" && view !== "company") throw Error("FORBIDDEN");
  if (view === "company" && !company) throw Error("FORBIDDEN");
  if (company && !u.access.companies.includes(company))
    throw Error("FORBIDDEN");
  const units =
    await erpDb()`select id,name from public.company where id=any(${u.companyIds}::int[]) and (${company || null}::text is null or name=${company || null})`;
  return { u, ids: units.map((r) => Number(r.id)) };
}
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const { ids } = await scope(
      q.get("view") || "company",
      q.get("company") || "",
    );
    const rows =
      await appDb()`select g.*,g.id::text,c.name as company,g.deadline::text,g.updated_at::text from platform.governance_item g join public.company c on c.id=g.company_id where g.company_id=any(${ids}::int[]) order by g.updated_at desc,g.id desc limit 501`;
    if (rows.length > 500)
      return Response.json(
        { error: "事项超过500条，请缩小法人范围" },
        { status: 422 },
      );
    const events =
      await appDb()`select e.*,e.id::text,e.item_id::text,e.created_at::text from platform.governance_item_event e join platform.governance_item g on g.id=e.item_id where g.company_id=any(${ids}::int[]) order by e.created_at,e.id limit 5000`;
    return Response.json(
      { rows, events },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
const base = z.object({
  view: z.enum(["group", "company"]),
  company: z.string().max(200),
  action: z.string().max(30),
});
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    const body = await req.json();
    const input = base.safeParse(body);
    if (!input.success)
      return Response.json({ error: "参数无效" }, { status: 400 });
    const p = input.data,
      { u, ids } = await scope(p.view, p.company);
    if (
      !can(
        u.access,
        p.view === "group" ? "governance.review" : "governance.create",
      )
    )
      throw Error("FORBIDDEN");
    if (p.action === "create") {
      const form = z
        .object({
          category: z.enum(governanceCategories),
          title: z.string().trim().min(3).max(200),
          owner: z.string().trim().min(1).max(60),
          deadline: z.iso.date(),
          basis: z.string().trim().min(3).max(3000),
          materials: z.string().trim().min(3).max(5000),
          finding: z.string().trim().min(3).max(5000),
        })
        .safeParse(body);
      if (!form.success || ids.length !== 1)
        return Response.json(
          { error: "请选择一个法人，并补齐事项、制度依据和材料信息" },
          { status: 400 },
        );
      const f = form.data;
      let id = "";
      await appDb().begin(async (t) => {
        const rows =
          await t`insert into platform.governance_item(company_id,category,title,owner,deadline,basis,materials,finding,status,origin,created_by) values(${ids[0]},${f.category},${f.title},${f.owner},${f.deadline},${f.basis},${f.materials},${f.finding},${p.view === "group" ? "需整改" : "待审核"},${p.view},${u.id}) returning id::text`;
        id = rows[0].id;
        await t`insert into platform.governance_item_event(item_id,actor_id,actor_name,perspective,action,note) values(${id},${u.id},${u.name},${p.view},${p.view === "group" ? "发起监管问题" : "提交治理自查"},${f.finding})`;
      });
      return Response.json({ ok: true, id });
    }
    const op = z
      .object({
        id: z.string().regex(/^\d+$/),
        version: z.number().int().positive(),
        note: z.string().trim().min(3).max(5000),
      })
      .safeParse(body);
    if (!op.success)
      return Response.json(
        { error: "请填写至少3字的办理说明" },
        { status: 400 },
      );
    await appDb().begin(async (t) => {
      const rows =
        await t`select * from platform.governance_item where id=${op.data.id} and company_id=any(${ids}::int[]) for update`;
      const r = rows[0];
      if (!r) throw Error("FORBIDDEN");
      const next = nextGovernanceStatus(p.view, r.status, p.action);
      if (!next || Number(r.version) !== op.data.version)
        throw Error("GOVERNANCE_CONFLICT");
      await t`update platform.governance_item set status=${next},version=version+1,updated_at=now() where id=${r.id}`;
      await t`insert into platform.governance_item_event(item_id,actor_id,actor_name,perspective,action,note) values(${r.id},${u.id},${u.name},${p.view},${p.action},${op.data.note})`;
    });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "GOVERNANCE_CONFLICT")
      return Response.json(
        { error: "事项状态已变化，或当前视角无此办理操作，请刷新" },
        { status: 409 },
      );
    return safeError(e);
  }
}
