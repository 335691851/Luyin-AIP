"use client";
import { useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { AccessState } from "./access-controls";
import { companies } from "@/lib/demo";
import { permissionLabels } from "@/lib/access";
import type { LocalUser, Permission } from "@/lib/access";
export default function AccessManager({
  kind,
  data,
}: {
  kind: "users" | "roles";
  data: AccessState;
}) {
  const { message } = App.useApp();
  const [editing, setEditing] = useState<LocalUser | null>(null),
    [open, setOpen] = useState(false),
    [form] = Form.useForm();
  const [roleId, setRoleId] = useState(data.roles[0]?.id || ""),
    [permissions, setPermissions] = useState<Permission[]>(
      data.roles[0]?.permissions || [],
    ),
    [busy, setBusy] = useState(false);
  const post = async (body: unknown) => {
    setBusy(true);
    try {
      const r = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      message.success("本地配置已保存");
      location.reload();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (user?: LocalUser) => {
    setEditing(user || null);
    form.resetFields();
    form.setFieldsValue(
      user || {
        name: "",
        email: "",
        company: companies[3],
        department: "销售部",
        scope: "company",
        roleId: "venture_operator",
        enabled: true,
      },
    );
    setOpen(true);
  };
  const scope = (u: LocalUser) =>
    u.scope === "group"
      ? "鲁盐监管范围（工厂及合资公司）"
      : u.scope === "department"
        ? `${u.company} / ${u.department}`
        : `本法人：${u.company}`;
  const groups = [
    {
      title: "经营分析",
      keys: [
        "sales.view",
        "profit.view",
        "coordination.view",
        "coordination.feedback",
        "data.export",
        "question.use",
      ],
    },
    { title: "调价决策", keys: ["price.view", "price.create", "price.review"] },
    {
      title: "监管与治理",
      keys: [
        "contracts.view",
        "governance.view",
        "governance.create",
        "governance.review",
      ],
    },
    { title: "系统管理", keys: ["admin.manage"] },
  ];
  return (
    <>
      <div className="access-description">
        本地用户与权限配置用于查看页面和操作差异，不创建Supabase登录账号。鲁银为虚拟汇总节点；鲁盐、工厂、合资公司为法人，营销为部门。审批与后台管理权限仅属于鲁盐集团管理员。
      </div>
      {kind === "users" ? (
        <section className="panel">
          <div className="panel-title">
            <h2>用户与组织绑定</h2>
            <Button type="primary" onClick={() => edit()}>
              新增用户
            </Button>
          </div>
          <Table<LocalUser>
            rowKey="id"
            dataSource={data.users}
            scroll={{ x: 1100 }}
            columns={[
              {
                title: "用户",
                dataIndex: "name",
                render: (v, u) => (
                  <>
                    <b>{v}</b>
                    <small className="sub">{u.email}</small>
                  </>
                ),
              },
              {
                title: "所属法人 / 部门",
                dataIndex: "company",
                render: (v, u) => (
                  <>
                    {v}
                    <small className="sub">{u.department}</small>
                  </>
                ),
              },
              {
                title: "角色",
                dataIndex: "roleId",
                render: (v) => data.roles.find((r) => r.id === v)?.name || v,
              },
              { title: "数据范围", key: "scope", render: (_, u) => scope(u) },
              {
                title: "状态",
                dataIndex: "enabled",
                render: (v) => (
                  <Tag color={v ? "green" : "default"}>
                    {v ? "启用" : "停用"}
                  </Tag>
                ),
              },
              {
                title: "操作",
                key: "edit",
                render: (_, u) => (
                  <Button type="link" onClick={() => edit(u)}>
                    编辑
                  </Button>
                ),
              },
            ]}
          />
          <div className="table-note">
            一个用户绑定一个角色及数据范围。停用后不能切换为该用户，当前预览身份也将失效。
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-title">
            <h2>角色 → 功能与操作</h2>
            <Space>
              <Select
                aria-label="选择配置角色"
                value={roleId}
                style={{ width: 210 }}
                onChange={(id) => {
                  setRoleId(id);
                  setPermissions(
                    data.roles.find((r) => r.id === id)?.permissions || [],
                  );
                }}
                options={data.roles.map((r) => ({
                  value: r.id,
                  label: r.name,
                }))}
              />
              <Button
                type="primary"
                loading={busy}
                onClick={() =>
                  post({ action: "saveRole", roleId, permissions })
                }
              >
                保存权限映射
              </Button>
            </Space>
          </div>
          <div className="permissions-body">
            <p>{data.roles.find((r) => r.id === roleId)?.description}</p>
            <div className="permission-grid">
              {groups.map((g) => (
                <section key={g.title}>
                  <h3>{g.title}</h3>
                  {g.keys.map((k) => {
                    const key = k as Permission;
                    return (
                      <Checkbox
                        key={key}
                        checked={permissions.includes(key)}
                        disabled={
                          (roleId !== "luyan_admin" &&
                            [
                              "admin.manage",
                              "price.review",
                              "governance.review",
                            ].includes(key)) ||
                          (roleId === "luyan_admin" && key === "admin.manage")
                        }
                        onChange={(e) =>
                          setPermissions((p) =>
                            e.target.checked
                              ? [...p, key]
                              : p.filter((x) => x !== key),
                          )
                        }
                      >
                        {permissionLabels[key]}
                      </Checkbox>
                    );
                  })}
                </section>
              ))}
            </div>
            <div className="note">
              角色控制可以做什么，用户数据范围控制可以看哪些法人/部门。仅隐藏菜单不足以保护数据，下载和问数接口也会检查权限。
            </div>
          </div>
        </section>
      )}
      <Modal
        title={editing ? "编辑用户" : "新增本地用户"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={busy}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) =>
            post({
              action: "saveUser",
              user: { ...v, id: editing?.id || `user-${Date.now()}` },
            })
          }
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱标识"
            rules={[{ required: true, type: "email" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="roleId" label="角色" rules={[{ required: true }]}>
            <Select
              options={data.roles.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Form.Item>
          <Form.Item
            name="company"
            label="所属法人"
            rules={[{ required: true }]}
          >
            <Select options={companies.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item
            name="department"
            label="所属部门"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="scope" label="数据范围" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "group", label: "鲁盐监管范围（仅管理方法人）" },
                { value: "company", label: "本法人" },
                { value: "department", label: "本法人下指定部门" },
              ]}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用用户" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
