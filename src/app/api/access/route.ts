import { cookies } from "next/headers";
import { z } from "zod";
import { demoMode } from "@/server/config";
import { identity, safeError } from "@/server/auth";
import {
  readAccess,
  changeAccess,
  previewSession,
} from "@/server/local-access";
import { can, resolveSession, permissionLabels, landing } from "@/lib/access";
import type { Permission } from "@/lib/access";
import { sameOrigin } from "@/lib/request-origin";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    if (!demoMode()) {
      const user = await identity();
      return Response.json(
        {
          session: user.access,
          users: user.admin ? [user.access.user] : [],
          roles: user.admin ? [user.access.role] : [],
          editable: false,
          previewAvailable: false,
          directoryReady: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const config = await readAccess();
    let session;
    try {
      session = await previewSession();
    } catch {
      session = null;
    }
    return Response.json(
      {
        session,
        users: config.users,
        roles: config.roles,
        editable: can(session, "admin.manage"),
        previewAvailable: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
const userSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  name: z.string().trim().min(1).max(60),
  email: z.email().max(150),
  company: z.string(),
  department: z.string().max(80),
  scope: z.enum(["group", "company", "department"]),
  roleId: z.string(),
  enabled: z.boolean(),
});
export async function POST(req: Request) {
  try {
    if (!demoMode() || !sameOrigin(req))
      return Response.json(
        { error: "仅本地演示管理员可使用角色预览与配置" },
        { status: 403 },
      );
    const body = await req.json();
    const jar = await cookies();
    if (body.action === "switch" || body.action === "reset") {
      const id =
        body.action === "reset" ? "demo-admin" : z.string().parse(body.userId);
      const session = resolveSession(await readAccess(), id);
      jar.set("luyin-preview-user", id, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      });
      return Response.json({ ok: true, landing: landing(session) });
    }
    const session = await previewSession();
    if (!can(session, "admin.manage"))
      return Response.json(
        { error: "当前视角没有用户与权限管理权，请结束预览后操作" },
        { status: 403 },
      );
    if (body.action === "saveUser") {
      const parsed = userSchema.safeParse(body.user);
      if (!parsed.success)
        return Response.json(
          { error: "请正确填写用户、邮箱、法人及角色" },
          { status: 400 },
        );
      await changeAccess((c) => ({
        ...c,
        users: c.users.some((u) => u.id === parsed.data.id)
          ? c.users.map((u) => (u.id === parsed.data.id ? parsed.data : u))
          : [...c.users, parsed.data],
      }));
    } else if (body.action === "saveRole") {
      const roleId = z.string().parse(body.roleId);
      const permissions = z
        .array(
          z.enum(
            Object.keys(permissionLabels) as [Permission, ...Permission[]],
          ),
        )
        .parse(body.permissions);
      await changeAccess((c) => {
        if (!c.roles.some((r) => r.id === roleId)) throw Error("角色不存在");
        return {
          ...c,
          roles: c.roles.map((r) =>
            r.id === roleId
              ? { ...r, permissions: [...new Set(permissions)] }
              : r,
          ),
        };
      });
    } else return Response.json({ error: "不支持的配置动作" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json({ error: "请求参数无效" }, { status: 400 });
    if (
      e instanceof Error &&
      !["FORBIDDEN", "INTERNAL_ERROR"].includes(e.message)
    )
      return Response.json({ error: e.message }, { status: 400 });
    return safeError(e);
  }
}
