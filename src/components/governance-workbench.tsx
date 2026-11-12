"use client";
import Link from "next/link";
import { isGroupReview } from "@/lib/governance-review";
import PricingAssessment from "./pricing-assessment";
import { readGovernanceStream } from "@/lib/governance-stream";
import { useProgressiveText } from "./use-progressive-text";
import GovernanceChat from "./governance-chat";
import ContractRisk from "./contract-risk";
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
  Upload,
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
  authorizedCompanies,
  search = "",
}: {
  view: "group" | "company";
  company: string;
  page: string;
  canCreate: boolean;
  canReview: boolean;
  authorizedCompanies: string[];
  search?: string;
}) {
  const { message } = App.useApp();
  const requestSequence = useRef(0);
  const analysisAbort = useRef<AbortController | null>(null);
  useEffect(() => () => analysisAbort.current?.abort(), [view, company]);
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
  const [attachments, setAttachments] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState("");
  const visibleAnalysis = useProgressiveText(analysis);
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
        setAttachments(d.attachments || []);
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
      message.success(
        view === "group" &&
          payload.action === "create" &&
          company &&
          payload.company !== company
          ? `事项已保存至${payload.company}；当前列表仍按${company}筛选`
          : "事项与办理记录已保存",
      );
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
      (!dataSource || r.data_source === dataSource) &&
      (page === "archives"
        ? r.item_kind === "archive"
        : page === "policies" || page === "assistant"
          ? true
          : view === "group"
            ? page === "risks"
              ? r.item_kind === "important_risk" && r.severity === "重要"
              : page === "reviews"
                ? isGroupReview(r, events)
                : page === "contracts"
                  ? r.item_kind === "contract_risk"
                  : r.item_kind === "important_risk" ||
                    (isGroupReview(r, events) && r.status === "待审核")
            : page === "rectification"
              ? r.item_kind === "rectification"
              : r.item_kind === "action"),
  );
  const terminal = ["已归档", "已闭环", "已驳回"];
  const visible = selectedRows.filter(
    (r) =>
      (!company || r.company === company) &&
      (!search ||
        [r.title, r.company, r.owner, r.category, r.finding]
          .join(" ")
          .includes(search)) &&
      (!categoryMap[page] || r.category === categoryMap[page]) &&
      (!filter || r.status === filter) &&
      true,
  );
  const actions: Record<string, string> = active
    ? {
        ...((
          governanceTransitions[view] as Record<string, Record<string, string>>
        )[active.status] || {}),
      }
    : {};
  if (
    active?.category !== "重大事项程序" &&
    active?.severity !== "重要" &&
    !active?.payload?.requiresGroupReview
  )
    delete actions["提请集团审核"];
  const allowed = view === "group" ? canReview : canCreate;
  const groupPage =
    view === "group" && ["overview", "risks", "reviews"].includes(page);
  const reviewDetail = view === "group" && active?.item_kind === "action";
  const reviewLabels: Record<string, string> = {
    归档通过: "同意申请并归档",
    不予通过: "不同意申请",
    退回补正: "退回公司补充材料",
    要求整改: "发现实质问题，要求整改",
  };
  const columns: ColumnsType<GovernanceItem> = [
    {
      title:
        page === "reviews" && view === "group"
          ? "公司申请与治理领域"
          : "事项与治理领域",
      render: (_, r) => (
        <>
          <Tag
            color={r.data_source === "synthetic_graph" ? "orange" : "default"}
          >
            {r.data_source === "synthetic_graph" ? "演练数据" : "人工登记"}
          </Tag>
          <b>{r.title}</b>
          {view === "group" && (
            <div>
              <Tag color={r.item_kind === "action" ? "blue" : "red"}>
                {r.item_kind === "action"
                  ? "公司提请 · 集团审议"
                  : "重要问题 · 集团处置"}
              </Tag>
            </div>
          )}
          <div className="muted">
            {r.category} ·{" "}
            {r.origin === "group" ? "集团监管发起" : "公司自查提交"}
          </div>
        </>
      ),
      width: 300,
    },
    {
      title: view === "group" && page === "reviews" ? "申请单位" : "责任单位",
      dataIndex: "company",
      width: 210,
    },
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
      title: view === "group" ? "审核 / 处置" : "办理 / 反馈",
      width: 130,
      render: (_, r) => (
        <Button
          type="link"
          onClick={() => {
            setActive(r);
            setAnalysis("");
            setAction("");
            setNote("");
          }}
        >
          {view === "group"
            ? r.item_kind === "action"
              ? "查看申请并审议"
              : "查看问题并处置"
            : "查看与办理"}
        </Button>
      ),
    },
  ];
  if (page === "assistant")
    return <GovernanceChat key={company} company={company} />;
  if (page === "archives")
    return (
      <section className="panel">
        <Tag color="orange">{company}治理档案 · 演练样例 · 只读</Tag>
        <h2>公司治理档案与核心章程</h2>
        <Alert
          type="info"
          title="以下为规范性结构样例，供治理动作生成与流程演练；尚未经股东会确认或替换为正式有效文件。"
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={selectedRows}
          pagination={false}
          columns={[
            { title: "规范文件", dataIndex: "title" },
            { title: "版本", render: (_, r) => r.payload?.version || "演练版" },
            {
              title: "核心章程与治理要求",
              render: (_, r) => (
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {r.payload?.content || r.basis}
                  <p>
                    <a
                      download={r.payload?.filename || "治理档案样例.md"}
                      href={
                        "data:text/plain;charset=utf-8," +
                        encodeURIComponent(
                          "# " +
                            r.title +
                            "\n演练样例，未确认正式生效\n" +
                            (r.payload?.content || r.basis),
                        )
                      }
                    >
                      下载规范文件样例
                    </a>
                  </p>
                </div>
              ),
            },
            { title: "必备材料", dataIndex: "materials" },
          ]}
        />
      </section>
    );
  if (page === "policies") {
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
            ? "聚焦重要监管问题处置与提请集团审核的事项；一般自查由公司内部办理"
            : "档案要求 → 治理动作 → 上传材料 → 公司审核 → 关联问题整改；重大事项提请集团审核"}
        </span>
      </div>
      {groupPage && (
        <Alert
          showIcon
          type={page === "risks" ? "warning" : "info"}
          className="section-gap"
          title={
            page === "overview"
              ? "集团监管总览：看全局、识别重点、分流待办"
              : page === "risks"
                ? "监管风险问题：集团主动审查与重要问题处置"
                : "治理事项审核：审议下属公司正式提请的申请"
          }
          description={
            page === "overview"
              ? "汇总重要监管问题和待集团审议的申请。可直接发起审查；日常公司自查和一般内部审核不进入集团待办。"
              : page === "risks"
                ? "来源：集团发起审查、公司报告或经确认的重要风险。办理：核实问题 → 要求公司整改 → 公司反馈证据 → 集团复核销项。"
                : "来源：下属公司完成内部审核后提请集团。集团不能代公司发起申请；由公司在重大事项程序等业务中提交材料、选择提请集团审核。材料不齐走补正，发现实质问题再要求整改；不同意申请不自动等于整改。"
          }
        />
      )}
      {view === "group" && page === "overview" && (
        <div className="governance-routing-cards">
          <Link href="/governance/risks">
            <b>重要监管问题</b>
            <strong>
              {
                selectedRows.filter(
                  (r) =>
                    r.item_kind === "important_risk" &&
                    !terminal.includes(r.status),
                ).length
              }
            </strong>
            <span>需核实、处置或验收 → 进入问题台账</span>
          </Link>
          <Link href="/governance/reviews">
            <b>公司提请集团审议</b>
            <strong>
              {
                selectedRows.filter(
                  (r) => isGroupReview(r, events) && r.status === "待审核",
                ).length
              }
            </strong>
            <span>需集团作出审议意见 → 进入申请待办</span>
          </Link>
        </div>
      )}
      {selectedRows.some((r) => r.data_source === "synthetic_graph") && (
        <Alert
          type="warning"
          showIcon
          className="section-gap"
          title={`当前范围包含 ${selectedRows.filter((r) => r.data_source === "synthetic_graph").length} 条演练事项；可办理并留痕，不代表企业真实风险或违规`}
        />
      )}
      {page === "contracts" && <ContractRisk />}
      <div className="kpi-row">
        {(view === "group" && page === "risks"
          ? [
              ["重要监管问题", selectedRows.length],
              [
                "待处置",
                selectedRows.filter((r) => r.status === "需整改").length,
              ],
              [
                "待集团复核",
                selectedRows.filter((r) => r.status === "整改待验收").length,
              ],
              [
                "已处置",
                selectedRows.filter((r) =>
                  ["已归档", "已闭环"].includes(r.status),
                ).length,
              ],
            ]
          : view === "group" && page === "reviews"
            ? [
                [
                  "待集团审议",
                  selectedRows.filter((r) => r.status === "待审核").length,
                ],
                [
                  "公司补正 / 整改中",
                  selectedRows.filter((r) =>
                    ["待补正", "需整改"].includes(r.status),
                  ).length,
                ],
                [
                  "已同意归档",
                  selectedRows.filter((r) => r.status === "已归档").length,
                ],
                [
                  "未予同意",
                  selectedRows.filter((r) => r.status === "已驳回").length,
                ],
              ]
            : view === "company"
              ? [
                  [
                    page === "rectification" ? "关联整改任务" : "本域管理动作",
                    selectedRows.length,
                  ],
                  [
                    "待公司响应",
                    selectedRows.filter((r) => r.status === "待响应").length,
                  ],
                  [
                    "待公司审核",
                    selectedRows.filter((r) =>
                      ["待公司审核", "整改待验收"].includes(r.status),
                    ).length,
                  ],
                  [
                    "整改 / 补正中",
                    selectedRows.filter((r) =>
                      ["需整改", "待补正"].includes(r.status),
                    ).length,
                  ],
                ]
              : [
                  ["本页事项", selectedRows.length],
                  [
                    "待集团审核",
                    selectedRows.filter((r) => r.status === "待审核").length,
                  ],
                  [
                    "待补正 / 整改",
                    selectedRows.filter((r) =>
                      ["需整改", "待补正"].includes(r.status),
                    ).length,
                  ],
                  [
                    "已完成",
                    selectedRows.filter((r) =>
                      ["已归档", "已闭环"].includes(r.status),
                    ).length,
                  ],
                ]
        ).map(([label, value]) => (
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
                ? "已登记合同风险处置（含模拟情景）"
                : page === "reviews"
                  ? "提请集团审核的治理事项"
                  : page === "risks"
                    ? "监管风险问题"
                    : page === "rectification"
                      ? "整改督办台账"
                      : "集团监管事项总览"
              : categoryMap[page] ||
                (page === "rectification" ? "整改反馈台账" : "企业治理工作台")}
          </h2>
          <Space wrap>
            {view === "company" && page !== "rectification" && (
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await fetch("/api/governance", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        view,
                        company,
                        action: "generate",
                      }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw Error(d.error);
                    await load();
                    message.success(
                      `智能体已生成${d.created}项治理动作，同季度同类动作不重复生成`,
                    );
                  } catch (e) {
                    message.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                ✦ 按档案生成治理动作
              </Button>
            )}
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
                "待响应",
                "待公司审核",
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
              style={{
                display:
                  view === "group" && !["risks", "overview"].includes(page)
                    ? "none"
                    : undefined,
              }}
              disabled={!allowed || (view === "company" && !company)}
              onClick={() => {
                setOpen(true);
              }}
            >
              {view === "group" ? "发起审查" : "提交治理管理动作"}
            </Button>
          </Space>
        </div>
        {!company && view === "group" && (
          <p className="muted">
            {page === "reviews"
              ? "当前汇总授权范围内公司提请集团的申请；一般公司内部归档事项不纳入审议列表。"
              : ["overview", "risks"].includes(page)
                ? "当前汇总授权范围内全部单位；可直接发起审查，并在表单中选择下属法人。"
                : "当前汇总授权范围内全部单位，可通过法人范围筛选责任单位。"}
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
          支持实际材料上传与下载（单份2MiB）；TXT/MD可供智能体读取，其他文件保存原件，由审核人核验。平台审核不替代法人治理决议。
        </div>
      </section>
      <Modal
        open={open}
        title={
          view === "group" ? "发起下属法人治理审查" : "提交本企业治理与自查事项"
        }
        footer={null}
        afterOpenChange={(visible) => {
          if (visible) form.resetFields();
        }}
        onCancel={() => !busy && setOpen(false)}
        width={700}
        destroyOnHidden
      >
        {view === "company" && <p>责任单位：{company}</p>}
        <Form
          form={form}
          initialValues={{
            category: categoryMap[page] || governanceCategories[1],
            company: authorizedCompanies.includes(company)
              ? company
              : undefined,
          }}
          layout="vertical"
          onFinish={(v) => void submit({ action: "create", ...v })}
        >
          {view === "group" && (
            <Form.Item
              name="company"
              label="审查对象（下属法人）"
              rules={[{ required: true, message: "请选择本次审查的下属法人" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择下属法人"
                options={authorizedCompanies.map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item
            name="category"
            label="治理领域"
            rules={[{ required: true }]}
          >
            <Select
              options={governanceCategories
                .filter((v) => v !== "公司治理档案")
                .map((value) => ({
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
              placeholder="材料编号、受控存放位置或核查记录；提交后可在详情上传原件"
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
        title={
          view === "group"
            ? reviewDetail
              ? "治理申请审议 · 集团作出意见"
              : "监管问题处置 · 核实与整改验收"
            : "治理事项与整改反馈"
        }
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
            {view === "group" && (
              <Alert
                type={reviewDetail ? "info" : "warning"}
                showIcon
                title={
                  reviewDetail
                    ? "审议前核对：公司是否已完成内部审核，事项是否确需集团决定"
                    : "处置前核对：问题事实、影响范围与核查证据"
                }
                description={
                  reviewDetail
                    ? "核对提请事项、决策权限、材料版本及回避情况，再作出同意、不同意或退回补正的意见。集团意见回到公司的原申请，不另建重复申请。"
                    : "核实后明确责任法人、整改要求、期限与验收标准；公司提交整改证据后，由集团复核销项。"
                }
              />
            )}
            <p>
              {active.company} · {active.owner} · 期限 {active.deadline}
            </p>
            <h3>{reviewDetail ? "集团审议权限与制度依据" : "适用依据"}</h3>
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
            <h3>{reviewDetail ? "公司提请材料" : "核查材料引用"}</h3>
            <p className="governance-detail-text">{active.materials}</p>
            <h3>
              {reviewDetail ? "公司申请说明与内部审核情况" : "问题 / 自查结果"}
            </h3>
            <p className="governance-detail-text">{active.finding}</p>
            {active.item_kind === "rectification" && (
              <Alert
                type="info"
                title="整改闭环要求"
                description={
                  active.payload?.acceptanceCriteria ||
                  "依据原事项审核意见补正材料，上传整改证据后提交复核；公司整改由公司验收，集团下达事项由集团验收，未经复核不得销项。"
                }
              />
            )}
            {active.parent_id && (
              <p>
                关联来源：
                <Button
                  type="link"
                  onClick={() => {
                    const parent = rows.find(
                      (r) => r.id === String(active.parent_id),
                    );
                    if (parent) {
                      setActive(parent);
                      setAnalysis("");
                    }
                  }}
                >
                  {rows.find((r) => r.id === String(active.parent_id))?.title ||
                    `事项 #${active.parent_id}`}
                </Button>
              </p>
            )}
            {rows
              .filter(
                (r) =>
                  String(r.parent_id) === active.id &&
                  r.item_kind === "rectification",
              )
              .map((r) => (
                <p key={r.id}>
                  关联整改：
                  <Button
                    type="link"
                    onClick={() => {
                      setActive(r);
                      setAnalysis("");
                    }}
                  >
                    {r.title} · {r.status}
                  </Button>
                </p>
              ))}
            <h3>已上传材料</h3>
            {attachments
              .filter((a) => a.item_id === active.id)
              .map((a) => (
                <p key={a.id}>
                  <a href={`/api/governance/files?id=${a.id}`}>{a.filename}</a>{" "}
                  · {a.size_bytes}字节 · SHA256 {a.sha256.slice(0, 12)}
                </p>
              ))}
            {view === "company" && canCreate && (
              <Upload
                accept=".pdf,.docx,.xlsx,.txt,.md,.png,.jpg,.jpeg"
                showUploadList={false}
                beforeUpload={async (file) => {
                  const body = new FormData();
                  body.append("file", file);
                  body.append("itemId", active.id);
                  try {
                    const r = await fetch("/api/governance/files", {
                      method: "POST",
                      body,
                    });
                    const d = await r.json();
                    if (!r.ok) throw Error(d.error);
                    await load();
                    message.success(
                      d.parsed
                        ? "材料已保存并读取文本"
                        : "原件已保存，内容需人工核验",
                    );
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                  return false;
                }}
              >
                <Button>上传材料（≤2MiB）</Button>
              </Upload>
            )}
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setAnalysis("");
                const ctrl = new AbortController();
                analysisAbort.current = ctrl;
                try {
                  const r = await fetch("/api/governance", {
                    signal: ctrl.signal,
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      view,
                      company: active.company,
                      action: "analyze",
                      id: active.id,
                    }),
                  });
                  if (!r.ok) throw Error((await r.json()).error);
                  if (!r.body) throw Error("未收到核查内容");
                  setAnalysis("");
                  await readGovernanceStream(r.body, (event) => {
                    if (event.type === "delta")
                      setAnalysis((text) => text + event.text);
                  });
                } catch (e) {
                  message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              ✦ 智能核查材料
            </Button>
            {analysis && (
              <div className="assistant-response">
                <PricingAssessment
                  text={visibleAnalysis}
                  label="治理材料核查建议"
                />
              </div>
            )}
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
                  {reviewDetail
                    ? "集团审议意见"
                    : view === "group"
                      ? "监管处置与验收"
                      : "提交补正 / 整改反馈"}
                </h3>
                <Select
                  aria-label="治理办理操作"
                  value={action || undefined}
                  placeholder="选择办理操作"
                  onChange={setAction}
                  style={{ width: "100%" }}
                  options={Object.keys(actions)
                    .filter(
                      (v) =>
                        canReview ||
                        ![
                          "审核通过",
                          "审核退回",
                          "公司验收",
                          "再次整改",
                        ].includes(v),
                    )
                    .map((value) => ({
                      value,
                      label: reviewDetail
                        ? reviewLabels[value] || value
                        : value,
                    }))}
                />
                <Input.TextArea
                  aria-label="治理办理说明"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  style={{ margin: "14px 0" }}
                  placeholder={
                    reviewDetail
                      ? "填写集团审议依据、同意或不同意的理由及附加条件；材料不足时列明需补充的内容"
                      : "填写问题核实依据、整改要求或验收证据；注明责任单位、整改期限与复核结论"
                  }
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
                  {reviewDetail
                    ? "提交集团审议意见"
                    : view === "group"
                      ? "保存监管处置结果"
                      : "保存办理结果"}
                </Button>
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
