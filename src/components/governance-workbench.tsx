"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  governanceCategories,
  governanceTransitions,
} from "@/lib/governance-workflow";
import type { GovernanceItem } from "@/lib/governance-workflow";
type Event = {
  id: string;
  item_id: string;
  actor_name: string;
  action: string;
  note: string;
  created_at: string;
  perspective: string;
};
const categoryMap: Record<string, string> = {
  archives: "公司治理档案",
  authority: "治理责任与授权",
  major: "重大事项程序",
  meetings: "会议决议与履职",
  checks: "制度与合规自查",
};
export default function GovernanceWorkbench({
  view,
  company,
  page,
  canCreate,
  canReview,
  search = "",
}: {
  view: "group" | "company";
  company: string;
  page: string;
  canCreate: boolean;
  canReview: boolean;
  search?: string;
}) {
  const { message } = App.useApp();
  const requestSequence = useRef(0);
  const [rows, setRows] = useState<GovernanceItem[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [active, setActive] = useState<GovernanceItem | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(""),
    [note, setNote] = useState("");
  const [form] = Form.useForm();
  const load = async (signal?: AbortSignal) => {
    const ticket = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/governance?${new URLSearchParams({ view, company })}`,
        {
          cache: "no-store",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
            : AbortSignal.timeout(25000),
        },
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (!signal?.aborted && ticket === requestSequence.current) {
        setRows(d.rows);
        setEvents(d.events);
      }
    } catch (e) {
      if (!signal?.aborted && ticket === requestSequence.current)
        setError(
          e instanceof DOMException && e.name === "TimeoutError"
            ? "读取超时，请点击重新读取；已保存的事项不会丢失。"
            : e instanceof Error
              ? e.message
              : "读取失败",
        );
    } finally {
      if (!signal?.aborted && ticket === requestSequence.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    setRows([]);
    setActive(null);
    setFilter("");
    const c = new AbortController();
    void load(c.signal);
    return () => {
      c.abort();
      requestSequence.current++;
    };
  }, [view, company]);
  const submit = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          view,
          company: active?.company || company,
          ...payload,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setOpen(false);
      setActive(null);
      setNote("");
      await load();
      message.success("事项与办理记录已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  const [dataSource, setDataSource] = useState("");
  const selectedRows = rows.filter(
    (r) =>
      (!company || r.company === company) &&
      (!dataSource || r.data_source === dataSource),
  );
  const terminal = ["已归档", "已闭环", "已驳回"];
  const visible = selectedRows.filter(
    (r) =>
      (!company || r.company === company) &&
      (!search ||
        [r.title, r.company, r.owner, r.category, r.finding]
          .join(" ")
          .includes(search)) &&
      (page !== "contracts" || r.title.includes("合同")) &&
      (!categoryMap[page] || r.category === categoryMap[page]) &&
      (!filter || r.status === filter) &&
      (page !== "reviews" || ["待审核", "整改待验收"].includes(r.status)) &&
      (!["risks", "rectification"].includes(page) ||
        ["需整改", "整改待验收", "待补正"].includes(r.status)),
  );
  const actions = active
    ? (governanceTransitions[view] as Record<string, Record<string, string>>)[
        active.status
      ] || {}
    : {};
  const allowed = view === "group" ? canReview : canCreate;
  const columns: ColumnsType<GovernanceItem> = [
    {
      title: "事项与治理领域",
      render: (_, r) => (
        <>
          <Tag
            color={r.data_source === "synthetic_graph" ? "orange" : "default"}
          >
            {r.data_source === "synthetic_graph" ? "演练数据" : "人工登记"}
          </Tag>
          <b>{r.title}</b>
          <div className="muted">
            {r.category} ·{" "}
            {r.origin === "group" ? "集团监管发起" : "公司自查提交"}
          </div>
        </>
      ),
      width: 300,
    },
    { title: "责任单位", dataIndex: "company", width: 210 },
    { title: "责任人", dataIndex: "owner", width: 100 },
    { title: "期限", dataIndex: "deadline", width: 110 },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (v) => (
        <Tag
          color={
            terminal.includes(v) ? "default" : v === "需整改" ? "red" : "gold"
          }
        >
          {v}
        </Tag>
      ),
    },
    {
      title: view === "group" ? "审核 / 督办" : "办理 / 反馈",
      width: 130,
      render: (_, r) => (
        <Button
          type="link"
          onClick={() => {
            setActive(r);
            setAction("");
            setNote("");
          }}
        >
          查看与办理
        </Button>
      ),
    },
  ];
  if (["policies", "assistant"].includes(page)) {
    const refs = new Map<
      string,
      { documentId: string; filename: string; usage: string; count: number }
    >();
    for (const r of selectedRows)
      for (const ref of r.source_refs || []) {
        const old = refs.get(ref.documentId);
        refs.set(ref.documentId, { ...ref, count: (old?.count || 0) + 1 });
      }
    return (
      <section className="panel">
        <h2>{page === "policies" ? "关联制度候选目录" : "治理自查辅助"}</h2>
        <Alert
          type="info"
          showIcon
          title="以下为事项引用的真实图谱制度目录，不是已发布的本公司检查规则"
          description="演练情景不代表真实问题；适用公司、有效版本和具体条款需确认。材料目前仅保存引用，尚无原件上传与签署核验。"
        />
        <Table
          rowKey="documentId"
          loading={loading}
          dataSource={[...refs.values()]}
          pagination={{ pageSize: 8 }}
          size="small"
          scroll={{ x: 800 }}
          columns={[
            { title: "图谱制度文件", dataIndex: "filename" },
            { title: "关联事项数", dataIndex: "count", width: 100 },
            {
              title: "适用状态",
              width: 120,
              render: () => <Tag color="gold">待人工确认</Tag>,
            },
            { title: "来源标识", dataIndex: "documentId", width: 280 },
          ]}
        />
        <p className="muted">
          仅展示当前授权单位事项引用的制度候选。图谱原文引用不等于该单位已经违反制度。
        </p>
      </section>
    );
  }
  return (
    <div className="governance-workbench">
      <div className="governance-perspective-note">
        <Tag color={view === "group" ? "red" : "blue"}>
          {view === "group" ? "集团监管视角" : "公司治理与自查视角"}
        </Tag>
        <span>
          {view === "group"
            ? "关注下级单位问题、整改进度与待审核事项"
            : "维护本企业治理资料，开展自查并反馈整改，不展示集团审批操作"}
        </span>
      </div>
      {selectedRows.some((r) => r.data_source === "synthetic_graph") && (
        <Alert
          type="warning"
          showIcon
          className="section-gap"
          title={`当前范围包含 ${selectedRows.filter((r) => r.data_source === "synthetic_graph").length} 条演练事项；可办理并留痕，不代表企业真实风险或违规`}
        />
      )}
      <div className="kpi-row">
        {[
          [
            view === "group" ? "监管范围事项" : "本企业治理事项",
            selectedRows.length,
          ],
          [
            "待集团审核",
            selectedRows.filter((r) => r.status === "待审核").length,
          ],
          [
            "待整改 / 补正",
            selectedRows.filter((r) => ["需整改", "待补正"].includes(r.status))
              .length,
          ],
          [
            "整改待验收",
            selectedRows.filter((r) => r.status === "整改待验收").length,
          ],
        ].map(([label, value]) => (
          <div className="kpi" key={label}>
            <span className="kpi-label">{label}</span>
            <strong>{loading ? "—" : value}</strong>
            <small>依据已登记事项统计，含标记的演练数据</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>
            {view === "group"
              ? page === "contracts"
                ? "年度合同覆盖核查事项"
                : page === "reviews"
                  ? "待审核事项"
                  : page === "risks"
                    ? "监管风险问题"
                    : page === "rectification"
                      ? "整改督办台账"
                      : "集团监管事项总览"
              : categoryMap[page] ||
                (page === "rectification" ? "整改反馈台账" : "企业治理工作台")}
          </h2>
          <Space wrap>
            <select
              className="governance-native-select"
              aria-label="治理数据来源"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
            >
              <option value="">全部来源</option>
              <option value="manual">人工登记</option>
              <option value="synthetic_graph">演练数据</option>
            </select>

            <Select
              aria-label="治理事项状态"
              value={filter}
              onChange={setFilter}
              options={[
                "",
                "待审核",
                "需整改",
                "待补正",
                "整改待验收",
                "已归档",
                "已闭环",
                "已驳回",
              ].map((value) => ({ value, label: value || "全部状态" }))}
            />
            <Button onClick={() => void load()}>重新读取</Button>
            <Button
              type="primary"
              disabled={!allowed || !company}
              onClick={() => {
                form.resetFields();
                form.setFieldsValue({
                  category: categoryMap[page] || governanceCategories[0],
                });
                setOpen(true);
              }}
            >
              {view === "group" ? "发起监管问题" : "提交治理自查"}
            </Button>
          </Space>
        </div>
        {!company && view === "group" && (
          <p className="muted">
            当前汇总授权范围内全部单位；发起监管问题前，请先在上方选择一个责任法人。
          </p>
        )}
        {error && <Alert type="error" title={error} showIcon />}
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={visible}
            size="small"
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText:
                view === "group"
                  ? "尚无已登记的监管事项；空台账不代表无风险"
                  : "本企业尚无治理事项，可提交自查或治理资料进行集团审核",
            }}
          />
        </Spin>
        <div className="table-note">
          材料栏保留引用或办理说明，不代表文件已上传；平台审核不替代法人治理决议。所有操作留痕。
        </div>
      </section>
      <Modal
        open={open}
        title={
          view === "group" ? "登记下级单位监管问题" : "提交本企业治理与自查事项"
        }
        footer={null}
        onCancel={() => !busy && setOpen(false)}
        width={700}
        destroyOnHidden
      >
        <p>责任单位：{company}</p>
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => void submit({ action: "create", ...v })}
        >
          <Form.Item
            name="category"
            label="治理领域"
            rules={[{ required: true }]}
          >
            <Select
              options={governanceCategories.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="事项标题"
            rules={[{ required: true, min: 3 }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Space align="start">
            <Form.Item name="owner" label="责任人" rules={[{ required: true }]}>
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item
              name="deadline"
              label="办理期限"
              rules={[{ required: true }]}
            >
              <Input type="date" />
            </Form.Item>
          </Space>
          <Form.Item
            name="basis"
            label="适用制度、版本与条款依据"
            rules={[{ required: true, min: 3 }]}
          >
            <Input.TextArea
              rows={2}
              placeholder="记录有效章程/制度名称、版本、具体条款；未确认时明确注明待核实"
            />
          </Form.Item>
          <Form.Item
            name="materials"
            label="材料引用与核查记录"
            rules={[{ required: true, min: 3 }]}
          >
            <Input.TextArea
              rows={2}
              placeholder="材料编号、受控存放位置或核查记录；此处不上传文件"
            />
          </Form.Item>
          <Form.Item
            name="finding"
            label={
              view === "group"
                ? "发现的问题与整改要求"
                : "自查结果与需集团关注的问题"
            }
            rules={[{ required: true, min: 3 }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button htmlType="submit" type="primary" loading={busy}>
            确认提交
          </Button>
        </Form>
      </Modal>
      <Drawer
        open={!!active}
        title={view === "group" ? "监管问题与审核处置" : "治理事项与整改反馈"}
        onClose={() => !busy && setActive(null)}
        styles={{ wrapper: { width: "min(760px,100vw)" } }}
      >
        {active && (
          <>
            {active.data_source === "synthetic_graph" && (
              <Alert
                type="warning"
                showIcon
                title="演练事项：虚拟创建用于流程操作，不代表企业真实问题"
                description="图谱制度文件是真实来源目录，但当前未确认对本公司的适用性及有效版本。"
              />
            )}
            <Tag>{active.status}</Tag>
            <h2>{active.title}</h2>
            <p>
              {active.company} · {active.owner} · 期限 {active.deadline}
            </p>
            <h3>适用依据</h3>
            <p className="governance-detail-text">{active.basis}</p>
            {!!active.source_refs?.length && (
              <>
                <h3>图谱参考来源</h3>
                {active.source_refs.map((ref) => (
                  <div className="governance-detail-text" key={ref.documentId}>
                    <b>{ref.filename}</b>
                    <p>{ref.usage}</p>
                    <small>
                      OntoRAG / {ref.ontologyVersion} / {ref.documentId}
                    </small>
                  </div>
                ))}
              </>
            )}
            <h3>材料引用</h3>
            <p className="governance-detail-text">{active.materials}</p>
            <h3>问题 / 自查结果</h3>
            <p className="governance-detail-text">{active.finding}</p>
            <h3>办理记录</h3>
            <Timeline
              items={events
                .filter((e) => e.item_id === active.id)
                .map((e) => ({
                  children: (
                    <>
                      <b>{e.action}</b>
                      <p>{e.note}</p>
                      <small>
                        {e.actor_name} ·{" "}
                        {e.perspective === "group" ? "集团" : "公司"} ·{" "}
                        {new Date(e.created_at).toLocaleString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                        })}
                      </small>
                    </>
                  ),
                }))}
            />
            {allowed && Object.keys(actions).length > 0 && (
              <>
                <h3>
                  {view === "group" ? "审核与处置" : "提交补正 / 整改反馈"}
                </h3>
                <Select
                  aria-label="治理办理操作"
                  value={action || undefined}
                  placeholder="选择办理操作"
                  onChange={setAction}
                  style={{ width: "100%" }}
                  options={Object.keys(actions).map((value) => ({
                    value,
                    label: value,
                  }))}
                />
                <Input.TextArea
                  aria-label="治理办理说明"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  style={{ margin: "14px 0" }}
                  placeholder="填写审核依据，或整改、补正材料的引用和完成情况"
                />
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!action || note.trim().length < 3}
                  onClick={() =>
                    void submit({
                      action,
                      id: active.id,
                      version: active.version,
                      note,
                    })
                  }
                >
                  保存办理结果
                </Button>
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
