"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tabs,
  Upload,
} from "antd";
type Line = {
  id: string;
  materialId: number;
  product: string;
  original: number;
  requested: number;
  qty: number;
  reason: string;
  status: string;
  version: number;
  approved?: number;
  opinion?: string;
};
type Batch = {
  id: string;
  company: string;
  lines: Line[];
  source: string;
  ai_text?: string;
  created_at: string;
};
export default function LivePricing({
  company,
  companies,
  search,
  canCreate,
  canReview,
}: {
  company: string;
  companies: string[];
  search: string;
  canCreate: boolean;
  canReview: boolean;
}) {
  const { message } = App.useApp();
  const [data, setData] = useState<{
    rows: Batch[];
    history: any[];
    materials: any[];
  }>({ rows: [], history: [], materials: [] });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [active, setActive] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [ai, setAi] = useState(""),
    [evidence, setEvidence] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("applications");
  const [form] = Form.useForm();
  const [drafts, setDrafts] = useState<
    Record<string, { note: string; approved: number | null }>
  >({});
  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/pricing?${new URLSearchParams({ company })}`,
        { signal },
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
      setError("");
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [company]);
  const batch = data.rows.find((b) => b.id === active);
  const post = async (body: any) => {
    const r = await fetch("/api/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    return d;
  };
  const review = async (l: Line, status: string) => {
    if (!batch) return;
    setBusy(true);
    try {
      const d = drafts[l.id];
      await post({
        action: "review",
        id: batch.id,
        lineId: l.id,
        version: l.version,
        status,
        note: d?.note || "",
        approved: d?.approved || l.requested,
      });
      await load();
      message.success("本行审核结果已保存");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {error && <Alert type="error" title={error} />}
      <div className="panel-title">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "applications", label: `申请批次（${data.rows.length}）` },
            { key: "history", label: `ERP调价历史（${data.history.length}）` },
          ]}
        />
        <Space>
          <Button onClick={() => void load()}>刷新</Button>
          <Button
            type="primary"
            disabled={!canCreate || loading || !data.materials.length}
            onClick={() => {
              setOpen(true);
            }}
          >
            新建申请
          </Button>
        </Space>
      </div>
      {tab === "applications" ? (
        <section className="panel">
          <Table
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            dataSource={data.rows.filter(
              (b) =>
                !search ||
                JSON.stringify([
                  b.id,
                  b.company,
                  b.lines.map((l) => l.product),
                ]).includes(search),
            )}
            columns={[
              {
                title: "申请批次",
                dataIndex: "id",
                render: (v, b) => (
                  <Button
                    type="link"
                    onClick={() => {
                      setActive(b.id);
                      setAi("");
                      setEvidence(null);
                      setDrafts({});
                    }}
                  >
                    {v}
                  </Button>
                ),
              },
              { title: "申请公司", dataIndex: "company" },
              {
                title: "申请内容",
                render: (_, b) =>
                  b.lines.map((l) => (
                    <Tag key={l.id}>
                      {l.product} · {l.requested}元/吨
                    </Tag>
                  )),
              },
              {
                title: "审核进度",
                render: (_, b) =>
                  `${b.lines.filter((l) => ["已通过", "已驳回"].includes(l.status)).length}/${b.lines.length}`,
              },
              {
                title: "来源",
                render: (_, b) => (
                  <Tag color={b.source === "synthetic" ? "orange" : "blue"}>
                    {b.source === "synthetic" ? "模拟历史批次" : "用户提交"}
                  </Tag>
                ),
              },
              {
                title: "操作",
                render: (_, b) => (
                  <Button
                    onClick={() => {
                      setActive(b.id);
                      setAi("");
                      setDrafts({});
                    }}
                  >
                    整批分析与审核
                  </Button>
                ),
              },
            ]}
          />
        </section>
      ) : (
        <section className="panel">
          <Alert
            type="info"
            title="ERP历史只读展示；源库模拟记录单独标识，历史申请价不等于财务内部结算价。"
          />
          <Table
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 15 }}
            scroll={{ x: 1200 }}
            dataSource={data.history.filter(
              (r) => !search || JSON.stringify(r).includes(search),
            )}
            columns={[
              { title: "历史申请", dataIndex: "application_no" },
              { title: "公司", dataIndex: "company" },
              { title: "产品", dataIndex: "material_name", width: 280 },
              { title: "原价（元/吨）", dataIndex: "original_price" },
              { title: "申请价", dataIndex: "requested_price" },
              { title: "批准价", dataIndex: "approved_price" },
              { title: "状态", dataIndex: "status" },
              {
                title: "申请时间",
                dataIndex: "applied_at",
                render: (v) => v?.slice(0, 10),
              },
              {
                title: "数据来源",
                render: (_, r) => (
                  <Tag color={r.is_simulated ? "orange" : "default"}>
                    {r.is_simulated ? "ERP模拟历史" : "ERP记录"}
                  </Tag>
                ),
              },
            ]}
          />
        </section>
      )}
      <Modal
        title="新建调价申请 · 一批多行"
        width={950}
        open={open}
        afterOpenChange={(visible) => {
          if (visible) {
            form.resetFields();
            form.setFieldsValue({
              company:
                company ||
                companies.find((c) => c.includes("泰安")) ||
                companies[0],
              rows: [{ qty: 1 }],
            });
          }
        }}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Alert
          type="info"
          title="含税人民币元/吨；产品从ERP目录选择。提交后保存到平台数据库，每行独立审核。"
        />
        <Upload
          accept=".xlsx"
          showUploadList={false}
          beforeUpload={async (file) => {
            try {
              const body = new FormData();
              body.append("file", file);
              const r = await fetch("/api/import", { method: "POST", body });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              const rows = d.rows.map((l: any) => ({
                ...l,
                materialId: data.materials.find((m) => m.name === l.product)
                  ?.id,
              }));
              form.setFieldValue("rows", rows);
              message.info("已解析，请补齐未匹配的ERP产品并逐行确认");
            } catch (e) {
              message.error((e as Error).message);
            }
            return false;
          }}
        >
          <Button style={{ margin: "12px 0" }}>导入XLSX申请明细</Button>
        </Upload>
        <Form
          initialValues={{
            rows: [{ qty: 1 }],
            company:
              company ||
              companies.find((c) => c.includes("泰安")) ||
              companies[0],
          }}
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setBusy(true);
            try {
              const rows = v.rows.map((l: any) => ({
                ...l,
                product: data.materials.find((m) => m.id === l.materialId)
                  ?.name,
              }));
              await post({ action: "create", company: v.company, rows });
              setOpen(false);
              setTab("applications");
              await load();
              message.success("申请已保存");
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="company"
            label="申请公司"
            rules={[{ required: true }]}
          >
            <Select options={companies.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.List
            name="rows"
            rules={[
              {
                validator: async (_, rows) => {
                  if (!rows?.length) throw Error("至少一行");
                },
              },
            ]}
          >
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <div
                    key={f.key}
                    className="panel"
                    style={{ padding: 14, marginBottom: 12 }}
                  >
                    <Space wrap align="start">
                      <Form.Item
                        name={[f.name, "materialId"]}
                        label={`第${f.name + 1}行 · ERP产品`}
                        rules={[{ required: true }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          style={{ width: 360 }}
                          options={data.materials.map((m) => ({
                            value: m.id,
                            label: `${m.name} / ${m.code}`,
                          }))}
                        />
                      </Form.Item>
                      {(
                        [
                          ["original", "原价"],
                          ["requested", "申请价"],
                          ["qty", "数量（吨）"],
                        ] as const
                      ).map(([key, label]) => (
                        <Form.Item
                          key={key}
                          name={[f.name, key]}
                          label={label}
                          rules={[{ required: true }]}
                        >
                          <InputNumber min={0.001} max={1e7} />
                        </Form.Item>
                      ))}
                      <Button danger onClick={() => remove(f.name)}>
                        移除
                      </Button>
                    </Space>
                    <Form.Item
                      name={[f.name, "reason"]}
                      label="调价理由与依据"
                      rules={[{ required: true, min: 3 }]}
                    >
                      <Input.TextArea rows={2} />
                    </Form.Item>
                  </div>
                ))}
                <Button onClick={() => add({ qty: 1 })}>添加调价行</Button>
              </>
            )}
          </Form.List>
          <Button
            type="primary"
            htmlType="submit"
            loading={busy}
            style={{ marginTop: 16 }}
          >
            提交申请
          </Button>
        </Form>
      </Modal>
      <Drawer
        title="调价申请 · 整批智能评估与逐行审核"
        open={!!batch}
        onClose={() => setActive(null)}
        size={1100}
      >
        {batch && (
          <>
            <Tag>
              {batch.source === "synthetic"
                ? "模拟批次 · 可办理留痕"
                : "用户申请"}
            </Tag>
            <h2>
              {batch.company} · {batch.id}
            </h2>
            <p>{batch.lines.length}个调价行 · 含税元/吨</p>
            <section className="ai-assessment">
              <div className="panel-title">
                <h3>✦ AI 整批证据分析</h3>
                <Button
                  type="primary"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const d = await post({ action: "analyze", id: batch.id });
                      setAi(d.text);
                      setEvidence(d.evidence);
                    } catch (e) {
                      message.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  生成智能评估
                </Button>
              </div>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {ai ||
                  batch.ai_text ||
                  "点击生成评估，智能体将读取申请方近30日销售、申请方和授权工厂库存、同产品历史调价。证据缺失会逐项说明。"}
              </p>
              {evidence && (
                <details>
                  <summary>本次数据证据快照</summary>
                  <pre style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(evidence, null, 2)}
                  </pre>
                </details>
              )}
            </section>
            <Table
              rowKey="id"
              pagination={false}
              scroll={{ x: 950 }}
              dataSource={batch.lines}
              columns={[
                {
                  title: "产品 / 理由",
                  width: 260,
                  render: (_, l) => (
                    <>
                      <b>{l.product}</b>
                      <p>{l.reason}</p>
                    </>
                  ),
                },
                { title: "原价", dataIndex: "original" },
                { title: "申请价", dataIndex: "requested" },
                { title: "吨数", dataIndex: "qty" },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (v) => <Tag>{v}</Tag>,
                },
                {
                  title: "审核意见 / 批准价",
                  width: 250,
                  render: (_, l) =>
                    ["待审核", "待补正"].includes(l.status) && canReview ? (
                      <>
                        <Input.TextArea
                          aria-label={`第${l.id}行审核意见`}
                          value={drafts[l.id]?.note || ""}
                          onChange={(e) =>
                            setDrafts((s) => ({
                              ...s,
                              [l.id]: {
                                approved: s[l.id]?.approved ?? l.requested,
                                note: e.target.value,
                              },
                            }))
                          }
                        />
                        <InputNumber
                          aria-label={`第${l.id}行批准价`}
                          value={drafts[l.id]?.approved ?? l.requested}
                          min={0.001}
                          onChange={(v) =>
                            setDrafts((s) => ({
                              ...s,
                              [l.id]: {
                                note: s[l.id]?.note || "",
                                approved: v,
                              },
                            }))
                          }
                        />
                        <Space wrap>
                          {["已通过", "已驳回", "待补正"].map((status) => (
                            <Button
                              key={status}
                              size="small"
                              loading={busy}
                              onClick={() => void review(l, status)}
                            >
                              {status}
                            </Button>
                          ))}
                        </Space>
                      </>
                    ) : (
                      <>
                        {l.opinion}
                        <p>{l.approved ? `批准价 ${l.approved}` : ""}</p>
                      </>
                    ),
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </>
  );
}
