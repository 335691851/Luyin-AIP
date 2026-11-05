"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "./workspace-session";
import { Button, Select, Tag } from "antd";
import type { AccessSession, LocalUser, Role } from "@/lib/access";
export type AccessState = {
  session: AccessSession | null;
  users: LocalUser[];
  roles: Role[];
  editable: boolean;
  previewAvailable?: boolean;
};
export function useAccess() {
  const workspace = useWorkspace();
  const [data, setData] = useState<AccessState | null>(null);
  useEffect(() => {
    if (workspace) return;
    const ctrl = new AbortController();
    const load = () =>
      fetch("/api/access", { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(setData)
        .catch(() => {});
    load();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", restore);
    return () => {
      ctrl.abort();
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", restore);
    };
  }, [!!workspace]);
  return workspace ? workspace.data : data;
}
export function RolePreview({ data }: { data: AccessState | null }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!data?.previewAvailable) return null;
  const change = async (id?: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          id ? { action: "switch", userId: id } : { action: "reset" },
        ),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      location.href = id ? result.landing : "/admin/users";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="role-preview">
      <Tag color={data.session?.preview ? "purple" : "default"}>
        {data.session?.preview ? "角色预览中" : "本地管理员"}
      </Tag>
      <Select
        aria-label="切换角色视角"
        virtual={false}
        loading={busy}
        disabled={busy}
        value={data.session?.user.id}
        placeholder="选择用户视角"
        onChange={change}
        style={{ width: 225 }}
        options={data.users
          .filter((u) => u.enabled)
          .map((u) => ({
            value: u.id,
            label: `${u.name} · ${data.roles.find((r) => r.id === u.roleId)?.name || u.roleId}`,
          }))}
      />
      {data.session?.preview && (
        <Button size="small" onClick={() => change()}>
          结束预览
        </Button>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
