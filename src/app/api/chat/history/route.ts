import { z } from "zod";
import { appDb } from "@/server/db";
import { insightOwner } from "@/server/insight-history";
import { safeError } from "@/server/auth";
import { sameOrigin } from "@/lib/request-origin";
import { demoMode } from "@/server/config";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const { user, accessKey } = await insightOwner();
    if (demoMode())
      return Response.json({ conversations: [], persistent: false });
    const url = new URL(req.url),
      id = url.searchParams.get("id"),
      before = url.searchParams.get("before");
    if (
      (id && !z.uuid().safeParse(id).success) ||
      (before && !/^\d{1,18}$/.test(before))
    )
      return Response.json({ error: "会话参数无效" }, { status: 400 });
    const db = appDb();
    if (!id) {
      const conversations =
        await db`select id,title,updated_at as "updatedAt" from platform.insight_conversation where user_id=${user.id} and access_key=${accessKey} order by updated_at desc,id limit 50`;
      return Response.json(
        { conversations, persistent: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const [conversation] =
      await db`select id,title,updated_at as "updatedAt" from platform.insight_conversation where id=${id} and user_id=${user.id} and access_key=${accessKey}`;
    if (!conversation)
      return Response.json(
        { error: "会话不存在或当前权限已变化" },
        { status: 404 },
      );
    const rows =
      await db`select id,seq::text,question,answer,context,created_at as "createdAt" from platform.insight_message m where conversation_id=${id} and (${before || null}::bigint is null or m.seq<${before || null}::bigint) order by m.seq desc limit 6`;
    const shown = rows.slice(0, 5);
    return Response.json(
      {
        conversation,
        messages: shown.reverse(),
        nextCursor: rows.length > 5 ? shown[0]?.seq : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    if (!sameOrigin(req))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    const { user, accessKey } = await insightOwner();
    const id = new URL(req.url).searchParams.get("id");
    if (!z.uuid().safeParse(id).success)
      return Response.json({ error: "会话标识无效" }, { status: 400 });
    const deleted =
      await appDb()`delete from platform.insight_conversation where id=${id!} and user_id=${user.id} and access_key=${accessKey} returning id`;
    return deleted.length
      ? Response.json({ ok: true })
      : Response.json({ error: "会话不存在" }, { status: 404 });
  } catch (e) {
    return safeError(e);
  }
}
