"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  App,
  Button,
  ConfigProvider,
  Form,
  Input,
  Modal,
  Table,
  Tag,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  ArrowLeftOutlined,
  ApiOutlined,
  DatabaseOutlined,
  PlusOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { synonyms } from "@/lib/demo";
import QuestionDrawer from "./question-drawer";
import { RolePreview, useAccess } from "./access-controls";
import AccessManager from "./access-manager";
import { can, permissionLabels } from "@/lib/access";
export default function AdminConsole({ page }: { page: string }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#b3212b",
          fontFamily: "Microsoft YaHei, sans-serif",
        },
      }}
    >
      <App>
        <AdminContent page={page} />
      </App>
    </ConfigProvider>
  );
}
function AdminContent({ page }: { page: string }) {
  const { message } = App.useApp();
  const access = useAccess();
  const [status, setStatus] = useState<{
    mode: string;
    integrations: { name: string; ready: boolean; note: string }[];
  } | null>(null);
  const [checks, setChecks] = useState<
    Record<
      string,
      { state: string; detail: string; checkedAt: string; durationMs: number }
    >
  >({});
  const [checking, setChecking] = useState<string[]>([]);
  async function checkConnection(service: string) {
    setChecking((items) => [...items, service]);
    try {
      const response = await fetch("/api/integrations/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "检测失败");
      setChecks((items) => ({ ...items, [service]: result }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "检测失败");
    } finally {
      setChecking((items) => items.filter((item) => item !== service));
    }
  }
  const [terms, setTerms] = useState(synonyms),
    [open, setOpen] = useState(false),
    [form] = Form.useForm();
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => {
        setStatus(s);
        if (s.mode === "demo") {
          try {
            const stored = JSON.parse(
              localStorage.getItem("luyin-demo-v1") || "{}",
            );
            if (Array.isArray(stored.semantic)) setTerms(stored.semantic);
          } catch {}
        }
      });
  }, []);
  const semantic = page === "semantic";
  const managing = page === "users" || page === "roles";
  const pageTitle =
    page === "users"
      ? "用户管理"
      : page === "roles"
        ? "角色权限映射"
        : semantic
          ? "问数语义建模"
          : "连接与集成";
  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div>
          <span className="seal">鲁</span>
          <b>鲁银智能化平台</b>
          <Tag>管理后台</Tag>
        </div>
        <Link href="/operation/reports">
          <ArrowLeftOutlined aria-hidden /> 返回业务平台
        </Link>
      </header>
      <div className="admin-role-strip">
        <RolePreview data={access} />
      </div>
      <aside className="admin-sidebar">
        <span className="nav-caption">系统配置与管理</span>
        <Link
          className={page === "integrations" ? "active" : ""}
          href="/admin/integrations"
        >
          <ApiOutlined aria-hidden />
          连接与集成
        </Link>
        <Link className={semantic ? "active" : ""} href="/admin/semantic">
          <DatabaseOutlined aria-hidden />
          问数语义建模
        </Link>
        <Link className={page === "users" ? "active" : ""} href="/admin/users">
          用户管理
        </Link>
        <Link className={page === "roles" ? "active" : ""} href="/admin/roles">
          角色权限映射
        </Link>
        <p>一个用户、一个角色、一个数据范围。保留单级管理员审批。</p>
      </aside>
      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h1>{pageTitle}</h1>
            <p>
              {managing
                ? "精简绑定用户、角色与法人/部门范围，切换视角验证页面和操作。"
                : semantic
                  ? "统一词汇、指标与业务边界。"
                  : "管理模型、数据和知识服务的连接状态。"}
            </p>
          </div>
          <SettingOutlined aria-hidden />
        </div>
        {!access ? (
          <p>正在检查权限…</p>
        ) : !can(access.session, "admin.manage") ? (
          <section className="panel setup-note">
            <h2>当前视角无后台管理权限</h2>
            <p>可在上方结束角色预览，返回鲁盐管理员。</p>
          </section>
        ) : managing && !access.editable ? (
          <section className="panel setup-note">
            <h2>{page === "users" ? "当前授权账号" : "当前超级用户权限"}</h2>
            <p>
              当前仅启用一个超级用户，使用真实身份与数据库授权。无需创建其他账号。
            </p>
            {page === "users" ? (
              <Table
                rowKey="id"
                pagination={false}
                dataSource={access.users}
                columns={[
                  { title: "姓名", dataIndex: "name" },
                  { title: "登录邮箱", dataIndex: "email" },
                  { title: "所属法人", dataIndex: "company" },
                  { title: "角色", render: () => access.session?.role.name },
                  {
                    title: "授权范围",
                    render: () =>
                      `${access.session?.companies.length || 0}家法人`,
                  },
                  {
                    title: "状态",
                    render: () => <Tag color="green">已启用</Tag>,
                  },
                ]}
                scroll={{ x: 850 }}
              />
            ) : (
              <Table
                rowKey="id"
                pagination={false}
                dataSource={access.roles}
                columns={[
                  { title: "角色", dataIndex: "name" },
                  {
                    title: "权限",
                    render: (_, role) =>
                      role.permissions.map((permission) => (
                        <Tag key={permission}>
                          {permissionLabels[permission]}
                        </Tag>
                      )),
                  },
                ]}
              />
            )}
          </section>
        ) : managing ? (
          <AccessManager
            kind={page === "users" ? "users" : "roles"}
            data={access}
          />
        ) : semantic ? (
          <section className="panel">
            <div className="panel-title">
              <h2>业务词典与同义词</h2>
              <Button
                type="primary"
                icon={<PlusOutlined aria-hidden />}
                disabled={status?.mode !== "demo"}
                onClick={() => setOpen(true)}
              >
                新增词条
              </Button>
            </div>
            <Table
              rowKey="id"
              dataSource={terms}
              columns={[
                { title: "同义词 / 别名", dataIndex: "term" },
                { title: "标准指标", dataIndex: "standard" },
                { title: "主题范围", dataIndex: "scope" },
                { title: "定义与边界", dataIndex: "note" },
              ]}
              scroll={{ x: 720 }}
            />
            <div className="table-note">
              当前词条为编辑预览，尚未发布到问数模型；正式发布需管理员确认与样例回归。
            </div>
          </section>
        ) : (
          <>
            <section className="panel">
              <div className="panel-title">
                <h2>服务连接状态</h2>
                <Tag>
                  {status?.mode === "demo" ? "本地演示配置" : "正式连接模式"}
                </Tag>
              </div>
              <Table
                rowKey="name"
                dataSource={status?.integrations || []}
                pagination={false}
                columns={[
                  { title: "服务", dataIndex: "name" },
                  {
                    title: "状态",
                    dataIndex: "ready",
                    render: (v) => (
                      <Tag color={v ? "green" : "gold"}>
                        {v ? "已填写 · 待验证" : "待配置"}
                      </Tag>
                    ),
                  },
                  { title: "说明", dataIndex: "note" },
                  {
                    title: "实际检测",
                    key: "check",
                    render: (_, row) =>
                      row.name === "Supabase身份" ? (
                        "登录时校验用户会话"
                      ) : (
                        <div>
                          <Button
                            size="small"
                            loading={checking.includes(row.name)}
                            onClick={() => checkConnection(row.name)}
                          >
                            检测连接
                          </Button>
                          {checks[row.name] && (
                            <p role="status">
                              <Tag
                                color={
                                  checks[row.name].state === "passed"
                                    ? "green"
                                    : "gold"
                                }
                              >
                                {
                                  (
                                    {
                                      passed: "通过",
                                      failed: "失败",
                                      incomplete: "未完整",
                                      unconfigured: "待配置",
                                    } as Record<string, string>
                                  )[checks[row.name].state]
                                }
                              </Tag>
                              {checks[row.name].detail}
                              <br />
                              <small>
                                {new Date(
                                  checks[row.name].checkedAt,
                                ).toLocaleString("zh-CN")}{" "}
                                · {checks[row.name].durationMs} ms
                              </small>
                            </p>
                          )}
                        </div>
                      ),
                  },
                ]}
              />
            </section>
            <section className="panel setup-note section-gap">
              <h2>服务端配置</h2>
              <p>
                在根目录 .env.local
                维护连接与密钥。发布密钥仅用于登录；数据库只读角色与平台业务写角色分离。页面不显示或编辑密钥。
              </p>
              <p>
                正式审批存储、文件归档和知识文档权限需完成对应集成后启用，当前配置存在不代表连接已验证。
              </p>
            </section>
          </>
        )}
      </main>
      <QuestionDrawer
        area="admin"
        pageTitle={pageTitle}
        month="2026-11"
        company=""
        demo={status?.mode === "demo"}
      />
      <Modal
        title="新增语义词条（本地预览）"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => {
            const next = [...terms, { ...v, id: `S-${Date.now()}` }];
            setTerms(next);
            try {
              const stored = JSON.parse(
                localStorage.getItem("luyin-demo-v1") || "{}",
              );
              localStorage.setItem(
                "luyin-demo-v1",
                JSON.stringify({ ...stored, semantic: next }),
              );
            } catch {
              message.warning("浏览器保存失败");
            }
            setOpen(false);
            form.resetFields();
            message.success("已保存预览，尚未发布到模型");
          }}
        >
          {[
            { name: "term", label: "同义词 / 别名" },
            { name: "standard", label: "标准指标" },
            { name: "scope", label: "主题范围" },
            { name: "note", label: "定义与边界" },
          ].map((f) => (
            <Form.Item
              key={f.name}
              name={f.name}
              label={f.label}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
}
