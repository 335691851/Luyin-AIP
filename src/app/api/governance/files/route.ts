import { createHash } from "node:crypto";
import { identity, safeError } from "@/server/auth";
import { appDb } from "@/server/db";
import { can } from "@/lib/access";
import { sameOrigin } from "@/lib/request-origin";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const u = await identity();
    if (!can(u.access, "governance.view")) throw Error("FORBIDDEN");
    const id = new URL(req.url).searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) throw Error("FORBIDDEN");
    const [f] =
      await appDb()`select a.* from platform.governance_attachment a join platform.governance_item g on g.id=a.item_id where a.id=${id} and g.company_id=any(${u.companyIds}::int[])`;
    if (!f) throw Error("FORBIDDEN");
    return new Response(Buffer.from(f.content_base64, "base64"), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    const u = await identity();
    if (!can(u.access, "governance.create")) throw Error("FORBIDDEN");
    const form = await req.formData();
    const file = form.get("file"),
      id = String(form.get("itemId") || "");
    if (
      !(file instanceof File) ||
      file.size > 2097152 ||
      file.size === 0 ||
      !/^\d+$/.test(id) ||
      !/\.(pdf|docx|xlsx|txt|md|png|jpg|jpeg)$/i.test(file.name)
    )
      return Response.json(
        { error: "支持2MiB以内的PDF、DOCX、XLSX、文本或图片材料" },
        { status: 400 },
      );
    const [item] =
      await appDb()`select id,item_kind from platform.governance_item where id=${id} and company_id=any(${u.companyIds}::int[])`;
    if (!item || item.item_kind === "archive") throw Error("FORBIDDEN");
    const bytes = Buffer.from(await file.arrayBuffer());
    const text = /\.(txt|md)$/i.test(file.name)
      ? bytes.toString("utf8").slice(0, 12000)
      : "";
    await appDb().begin(async (t) => {
      await t`select id from platform.governance_item where id=${id} for update`;
      const [count] =
        await t`select count(*)::int n from platform.governance_attachment where item_id=${id}`;
      if (count.n >= 10) throw Error("FILE_LIMIT");
      await t`insert into platform.governance_attachment(item_id,filename,mime,size_bytes,sha256,content_base64,extracted_text,created_by) values(${id},${file.name.slice(0, 200)},${file.type || "application/octet-stream"},${file.size},${createHash("sha256").update(bytes).digest("hex")},${bytes.toString("base64")},${text},${u.id})`;
      await t`insert into platform.governance_item_event(item_id,actor_id,actor_name,perspective,action,note) values(${id},${u.id},${u.name},'company','上传治理材料',${file.name.slice(0, 200)})`;
    });
    return Response.json({ ok: true, parsed: !!text });
  } catch (e) {
    if (e instanceof Error && e.message === "FILE_LIMIT")
      return Response.json({ error: "每个事项最多10份材料" }, { status: 422 });
    return safeError(e);
  }
}
