"use client";
import { useMemo, useState } from "react";
import {
  App,
  Button,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
  Tabs,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  RobotOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import type { PriceLine } from "@/lib/demo";
import type { Sale } from "@/lib/report-model";
import { aggregateReview, requireReview } from "@/lib/domain";
const fmt = (n: number) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const statusTag = (s: string) => (
  <Tag
    color={
      s === "已通过"
        ? "green"
        : s === "已驳回"
          ? "red"
          : s === "待补正"
            ? "gold"
            : "processing"
    }
  >
    {s}
  </Tag>
);
type Batch = {
  id: string;
  company: string;
  lines: PriceLine[];
  qty: number;
  status: string;
  pending: number;
};
export default function PriceBatches({
  lines,
  onChange,
  demo,
  company,
  search,
  sales,
  canReview,
  canCreate,
}: {
  lines: PriceLine[];
  onChange: (lines: PriceLine[]) => void;
  demo: boolean;
  company: string;
  search: string;
  sales: Sale[];
  canReview: boolean;
  canCreate: boolean;
}) {
  const { message } = App.useApp();
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all");
  const [drafts, setDrafts] = useState<
    Record<string, { price: number | null; opinion: string }>
  >({});
  const batches = useMemo(() => {
    const map = new Map<string, PriceLine[]>();
    lines.forEach((l) =>
      map.set(l.application, [...(map.get(l.application) || []), l]),
    );
    return [...map].map(([id, ls]) => ({
      id,
      company: ls[0].company,
      lines: ls,
      qty: ls.reduce((n, l) => n + l.qty, 0),
      pending: ls.filter((l) => l.status === "待审核").length,
      status: aggregateReview(ls.map((l) => l.status)),
    }));
  }, [lines]);
  const batch = batches.find((b) => b.id === selected);
  const shown = batches.filter(
    (b) =>
      (!company || b.company === company) &&
      (!search ||
        [b.id, b.company, ...b.lines.map((l) => l.product)]
          .join(" ")
          .includes(search)) &&
      (filter === "all" ||
        (filter === "pending" ? b.pending > 0 : b.status === filter)),
  );
  const review = (line: PriceLine, status: PriceLine["status"]) => {
    try {
      if (!canReview) throw Error("当前角色无逐行审核权限");
      if (!demo) throw Error("正式审批接口尚未接入");
      const draft = drafts[line.id] || { price: line.requested, opinion: "" };
      requireReview(line.status, draft.opinion);
      if (status === "已通过" && (!draft.price || draft.price <= 0))
        throw Error("请输入有效批准价");
      onChange(
        lines.map((l) =>
          l.id === line.id
            ? {
                ...l,
                status,
                opinion: draft.opinion,
                approved: status === "已通过" ? draft.price! : undefined,
                version: l.version + 1,
              }
            : l,
        ),
      );
      message.success(`${line.product}：${status}，其他申请行保持独立`);
    } catch (e) {
      message.warning((e as Error).message);
    }
  };
  const setDraft = (
    l: PriceLine,
    part: Partial<{ price: number | null; opinion: string }>,
  ) =>
    setDrafts((d) => ({
      ...d,
      [l.id]: { ...(d[l.id] || { price: l.requested, opinion: "" }), ...part },
    }));
  const columns: ColumnsType<Batch> = [
    {
      title: "申请批次",
      dataIndex: "id",
      width: 235,
      render: (v, b) => (
        <>
          <button
            className="text-action batch-title"
            onClick={() => setSelected(b.id)}
          >
            {v}
          </button>
          <small className="sub">
            专项调价 · {b.lines.length}项产品 / 价格
          </small>
        </>
      ),
    },
    { title: "申请法人", dataIndex: "company", width: 200 },
    {
      title: "本批申请内容",
      key: "products",
      render: (_, b) => (
        <div className="batch-products">
          {b.lines.map((l) => (
            <Tag key={l.id}>{l.product}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: "申请数量（吨）",
      dataIndex: "qty",
      align: "right",
      width: 130,
      render: fmt,
    },
    {
      title: "审批进度",
      key: "progress",
      width: 130,
      render: (_, b) => (
        <>
          <b>
            {
              b.lines.filter(
                (l) => l.status === "已通过" || l.status === "已驳回",
              ).length
            }{" "}
            / {b.lines.length}
          </b>
          <small className="sub">待审核 {b.pending} 项</small>
        </>
      ),
    },
    { title: "整批状态", dataIndex: "status", width: 110, render: statusTag },
    {
      title: "操作",
      key: "action",
      width: 150,
      render: (_, b) => (
        <Button type="link" onClick={() => setSelected(b.id)}>
          整批分析与审核 <ArrowRightOutlined aria-hidden />
        </Button>
      ),
    },
  ];
  const detailColumns: ColumnsType<PriceLine> = [
    {
      title: "申请明细",
      key: "product",
      width: 190,
      render: (_, l) => (
        <>
          <b>{l.product}</b>
          <small className="sub">
            {l.id} · 版本 {l.version}
          </small>
        </>
      ),
    },
    {
      title: "调价方案（元/吨）",
      children: [
        {
          title: "原价",
          dataIndex: "original",
          width: 90,
          align: "right",
          render: fmt,
        },
        {
          title: "申请价",
          dataIndex: "requested",
          width: 90,
          align: "right",
          render: (n: number) => <b className="brand-text">{fmt(n)}</b>,
        },
        {
          title: "幅度",
          key: "delta",
          width: 80,
          align: "right",
          render: (_, l) =>
            `${((l.requested / l.original - 1) * 100).toFixed(1)}%`,
        },
      ],
    },
    { title: "吨位", dataIndex: "qty", width: 70, align: "right" },
    { title: "行状态", dataIndex: "status", width: 100, render: statusTag },
    {
      title: "批准价",
      key: "approved",
      width: 120,
      render: (_, l) =>
        l.status === "待审核" && canReview ? (
          <InputNumber
            aria-label={`${l.id}批准价`}
            min={0.01}
            value={drafts[l.id]?.price ?? l.requested}
            onChange={(v) => setDraft(l, { price: v })}
            style={{ width: 105 }}
          />
        ) : l.approved ? (
          fmt(l.approved)
        ) : (
          "—"
        ),
    },
    {
      title: "管理员意见 / 行操作",
      key: "review",
      width: 280,
      render: (_, l) =>
        l.status === "待审核" && canReview ? (
          <div className="line-review">
            <Input
              aria-label={`${l.id}审核意见`}
              placeholder="填写本行审批依据"
              value={drafts[l.id]?.opinion || ""}
              onChange={(e) => setDraft(l, { opinion: e.target.value })}
            />
            <Space size={4}>
              <Button
                size="small"
                type="primary"
                aria-label={`${l.id}通过`}
                onClick={() => review(l, "已通过")}
              >
                通过
              </Button>
              <Button
                size="small"
                danger
                aria-label={`${l.id}驳回`}
                onClick={() => review(l, "已驳回")}
              >
                驳回
              </Button>
              <Button
                size="small"
                aria-label={`${l.id}补正`}
                onClick={() => review(l, "待补正")}
              >
                补正
              </Button>
            </Space>
          </div>
        ) : (
          <div>
            <span>{l.opinion || "等待补充材料"}</span>
            {l.status === "待补正" && demo && canCreate && (
              <Button
                size="small"
                onClick={() =>
                  onChange(
                    lines.map((r) =>
                      r.id === l.id
                        ? { ...r, status: "待审核", version: r.version + 1 }
                        : r,
                    ),
                  )
                }
              >
                补充后重新提交
              </Button>
            )}
          </div>
        ),
    },
  ];
  const related = batch
    ? sales.filter(
        (s) =>
          s.company === batch.company &&
          batch.lines.some((l) => l.product === s.product),
      )
    : [];
  return (
    <>
      <section className="panel batch-list">
        <div className="batch-list-heading">
          <div>
            <h2>调价申请批次</h2>
            <p>一批申请汇总展示，进入后查看全部价格行与整体智能判断。</p>
          </div>
          <span>{shown.length} 批申请</span>
        </div>
        <Tabs
          activeKey={filter}
          onChange={setFilter}
          items={[
            { key: "all", label: "全部批次" },
            { key: "pending", label: "待我审核" },
            { key: "部分通过", label: "部分通过" },
            { key: "全部通过", label: "全部通过" },
          ]}
        />
        <Table
          rowKey="id"
          columns={columns}
          dataSource={shown}
          scroll={{ x: 1160 }}
          pagination={{ pageSize: 8 }}
          locale={{
            emptyText: (
              <Empty
                description={
                  demo ? "当前条件没有申请批次" : "正式调价申请存储尚未接入"
                }
              />
            ),
          }}
        />
        <div className="table-note">
          批次为展示与评估单位；各调价明细行仍由鲁盐管理员独立审批。
          {demo ? "当前为本地演示，审批仅保存在本浏览器。" : ""}
        </div>
      </section>
      <Drawer
        open={!!batch}
        onClose={() => setSelected(null)}
        size={1180}
        title="调价申请 · 整批分析与审核"
        className="batch-drawer"
        extra={batch && statusTag(batch.status)}
      >
        {batch && (
          <>
            <header className="batch-detail-heading">
              <div>
                <span className="eyebrow">{batch.id}</span>
                <h2>{batch.company} · 专项调价申请</h2>
                <p>
                  {batch.lines.length}条调价明细 · 合计 {fmt(batch.qty)} 吨 ·
                  人民币含税元/吨
                </p>
              </div>
              <div>
                <b>{batch.pending}</b>
                <span>项待审核</span>
              </div>
            </header>
            <section className="ai-assessment">
              <div className="ai-assessment-heading">
                <div className="ai-orb">
                  <RobotOutlined aria-hidden />
                </div>
                <div>
                  <b>AI 整批评估</b>
                  <small>
                    综合申请内容与证据完整性，辅助您判断本批调价依据
                  </small>
                </div>
                <Tag>
                  {demo ? "演示证据整理 · 非模型实调" : "待完成多源连接"}
                </Tag>
              </div>
              <div className="ai-answer-body">
                <span className="ai-result-label">
                  <CheckCircleOutlined aria-hidden /> 已整理{" "}
                  {batch.lines.length} 条申请
                </span>
                <h3>本批需先补全库存与财务价格证据，再逐行决定是否批准。</h3>
                <p>
                  本批涉及 {batch.lines.map((l) => l.product).join("、")}
                  ，申请幅度为{" "}
                  {Math.min(
                    ...batch.lines.map(
                      (l) => (l.requested / l.original - 1) * 100,
                    ),
                  ).toFixed(1)}
                  % 至{" "}
                  {Math.max(
                    ...batch.lines.map(
                      (l) => (l.requested / l.original - 1) * 100,
                    ),
                  ).toFixed(1)}
                  %。
                  {related.length
                    ? `当前订单样例可匹配${related.length}行，但不能代替完整近期销售证据。`
                    : "当前筛选的订单记录中，没有足以核实本批申请理由的完整销售证据。"}
                  仅凭申请降价理由不能确认其合理性。
                </p>
                <div className="evidence-grid">
                  {[
                    {
                      name: "近期销售表现",
                      state: related.length ? "样例可对照" : "待补数据",
                      text: related.length
                        ? `${related.length}条关联订单，需核对观察期和实际成交口径`
                        : "补充申请方近期销量、成交价格和客户订单",
                    },
                    {
                      name: "申请方与工厂库存",
                      state: "待补数据",
                      text: "缺少同期可用库存、库龄和冻结情况",
                    },
                    {
                      name: "财务内部结算价",
                      state: "待补数据",
                      text: "缺少生效中的集团至申请方结算价",
                    },
                    {
                      name: "历史调价与原件",
                      state: "待核实",
                      text: "需比对可比规格、申请范围和原件依据",
                    },
                  ].map((e) => (
                    <div key={e.name}>
                      <span>
                        <FileSearchOutlined aria-hidden /> {e.name}
                      </span>
                      <Tag color="gold">{e.state}</Tag>
                      <p>{e.text}</p>
                    </div>
                  ))}
                </div>
                <div className="ai-next">
                  <b>建议审核关注</b>
                  <ol>
                    <li>核实本批各产品的有效内部价格与申请范围是否一致。</li>
                    <li>逐行检查申请理由与库存、近期销售情况是否相互印证。</li>
                    <li>证据缺失的行先补正，已具备充分依据的行可独立审批。</li>
                  </ol>
                </div>
                <footer>
                  依据：本批申请明细{related.length ? "、当前授权订单样例" : ""}{" "}
                  · 缺失证据不按满足处理 · 未调用真实模型，不自动批准
                </footer>
              </div>
            </section>
            <section className="batch-lines">
              <div className="report-section-heading">
                <h2>本批全部调价明细</h2>
                <span>逐行填写意见，结果独立生效</span>
              </div>
              <Table
                rowKey="id"
                size="small"
                bordered
                columns={detailColumns}
                dataSource={batch.lines}
                pagination={false}
                scroll={{ x: 1120 }}
              />
            </section>
            <section className="batch-reasons">
              <h3>申请理由与依据</h3>
              {batch.lines.map((l) => (
                <div key={l.id}>
                  <b>{l.product}</b>
                  <p>{l.reason}</p>
                </div>
              ))}
            </section>
          </>
        )}
      </Drawer>
    </>
  );
}
