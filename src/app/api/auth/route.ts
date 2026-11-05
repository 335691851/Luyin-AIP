import { sameOrigin } from "@/lib/request-origin";
import { authClient, identity, safeError } from "@/server/auth";
import { demoMode } from "@/server/config";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    const input = z
      .object({ email: z.email(), password: z.string().min(1) })
      .safeParse(await req.json());
    if (!input.success)
      return Response.json({ error: "请输入邮箱及密码" }, { status: 400 });
    const client = await authClient();
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error)
      return Response.json(
        { error: "登录失败，请核对账号及密码" },
        { status: 401 },
      );
    if (!demoMode()) {
      try {
        await identity();
      } catch (error) {
        await client.auth.signOut({ scope: "local" });
        return safeError(error);
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    if (!sameOrigin(req))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    const { error } = await (
      await authClient()
    ).auth.signOut({ scope: "local" });
    if (error)
      return Response.json({ error: "退出失败，请重试" }, { status: 503 });
    return Response.json({ ok: true });
  } catch (error) {
    return safeError(error);
  }
}
