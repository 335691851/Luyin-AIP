"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Input,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Demo from "./coordination-demo";
import type {
  CoordinationCandidate as Candidate,
  CoordinationEvent,
} from "@/lib/coordination";
type Data = {
  candidates: Candidate[];
  history: CoordinationEvent[];
  truncated: boolean;
  checkedAt: string;
  limitations: string[];
  counts: Record<string, number>;
};
type Props = {
  demo: boolean;
  allowedCompanies: string[];
  canFeedback: boolean;
  company: string;
  search: string;
};
const kinds = [
  { id: "tail", name: "成品尾库清理", desc: "超3个自然月 · 余量小于0.5吨" },
  { id: "clear", name: "库存销售计划", desc: "库存与近30日订单覆盖分析" },
  { id: "prepare", name: "工厂备货计划", desc: "待需求、在途与产能口径接入" },
];
export default function CoordinationCards(props: Props) {
  return props.demo ? <Demo {...props} /> : <Live {...props} />;
}
function Live({ canFeedback, company, search }: Props) {
  const { message } = App.useApp();
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [historyEvent, setHistoryEvent] = useState<CoordinationEvent | null>(
    null,
  );
  const [pageIndex, setPageIndex] = useState(1);
  const [type, setType] = useState("tail"),
    [detail, setDetail] = useState<Candidate | null>(null),
    [historical, setHistorical] = useState(false),
    [aiBusy, setAiBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [note, setNote] = useState(""),
    [decision, setDecision] = useState("待定"),
    [historyStatus, setHistoryStatus] = useState("全部");
  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/coordination?${new URLSearchParams({ company })}`,
        { cache: "no-store", signal },
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (!signal?.aborted) {
        setData(d);
        if (!data && !d.counts.tail && d.counts.clear) setType("clear");
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [company]);
  useEffect(() => setPageIndex(1), [type, company, search]);
  const matches = (c: Candidate) =>
    (!company || c.company === company) &&
    (!search || [c.id, c.company, c.product].join(" ").includes(search));
  const candidates = (data?.candidates || []).filter(
    (c) =>
      c.kind === type && matches(c) && !["同意", "否决"].includes(c.status),
  );
  const history = (data?.history || []).filter(
    (h) =>
      matches(h.snapshot) &&
      (historyStatus === "全部" || h.decision === historyStatus),
  );
  const open = (c: Candidate, history = false, event?: CoordinationEvent) => {
    setHistoryEvent(event || null);
    setDetail(c);
    setHistorical(history);
    setNote("");
    setDecision("待定");
  };
  const act = async (action: "analyze" | "decide") => {
    if (!detail || !canFeedback) return;
    if (action === "decide" && !note.trim())
      return void message.warning("请填写判断依据或待补充事项");
    action === "analyze" ? setAiBusy(true) : setSaving(true);
    try {
      const r = await fetch(
        `/api/coordination?${new URLSearchParams({ company })}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evidenceKey: detail.evidenceKey,
            company: detail.company,
            id: detail.id,
            version: detail.version,
            action,
            decision,
            note,
          }),
        },
      );
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      const updated = {
        ...detail,
        version: result.version,
        aiText: result.aiText,
        status: result.status,
      };
      setDetail(updated);
      setData((d) =>
        d
          ? {
              ...d,
              candidates: d.candidates.map((c) =>
                c.id === updated.id ? updated : c,
              ),
            }
          : d,
      );
      if (action === "decide") {
        setDetail(null);
        await load();
        message.success("处理结果与证据快照已保存");
      } else message.success("AI分析已生成并保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setAiBusy(false);
      setSaving(false);
    }
  };
  const columns: ColumnsType<CoordinationEvent> = [
    {
      title: "处理时间",
      dataIndex: "created_at",
      width: 160,
      render: (v) =>
        new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    },
    {
      title: "建议与法人",
      render: (_, h) => (
        <>
          <b>{h.snapshot.product}</b>
          <div className="muted">{h.snapshot.company}</div>
        </>
      ),
    },
    {
      title: "结果",
      dataIndex: "decision",
      width: 80,
      render: (v) => (
        <Tag color={v === "同意" ? "green" : v === "否决" ? "red" : "gold"}>
          {v}
        </Tag>
      ),
    },
    { title: "处理说明", dataIndex: "note", ellipsis: true },
    { title: "处理人", dataIndex: "actor_name", width: 100 },
    {
      title: "留档",
      width: 100,
      render: (_, h) => (
        <Button
          size="small"
          type="link"
          onClick={() => open({ ...h.snapshot, aiText: h.ai_text }, true, h)}
        >
          查看快照
        </Button>
      ),
    },
  ];
  return (
    <div className="coordination-workspace">
      <div className="coordination-types">
        {kinds.map((k) => (
          <button
            key={k.id}
            className={type === k.id ? "active" : ""}
            onClick={() => setType(k.id)}
          >
            <span>
              <b>{k.name}</b>
              <small>{k.desc}</small>
            </span>
            <em>
              {loading
                ? "…"
                : (data?.candidates || []).filter(
                    (c) =>
                      c.kind === k.id &&
                      matches(c) &&
                      !["同意", "否决"].includes(c.status),
                  ).length}
            </em>
          </button>
        ))}
      </div>
      <Button
        type="link"
        onClick={() =>
          document
            .querySelector(".coordination-history")
            ?.scrollIntoView({ behavior: "smooth" })
        }
      >
        查看处理记录（{history.length}）
      </Button>
      <div className="candidate-summary">
        <span>
          <b>{candidates.length}</b> 条待处理建议
        </span>
        <span>检查日 {data?.checkedAt || "—"}</span>
        <small>规则筛选候选 · AI解读证据 · 人工确认</small>
        <Button onClick={() => void load()} loading={loading}>
          重新计算
        </Button>
      </div>
      {error && (
        <Alert type="error" title="建议读取失败" description={error} showIcon />
      )}
      {data?.truncated && (
        <Alert
          type="info"
          title="每类最多展示100条候选；数量是当前展示范围，请结合源库核查"
        />
      )}
      {["tail", "prepare"].includes(type) && (
        <details className="panel" style={{ padding: 16, margin: "12px 0" }}>
          <summary>ERP需要补充哪些数据？</summary>
          {type === "tail" ? (
            <p>
              按公司/成品/批次补齐stock_balance余额与占用量、lot批次号、stock_transaction完整正向入库历史；单位必须为吨。判定为检查日向前3个自然月之前入库，且批次合计0&lt;余额&lt;0.5吨。无匹配不等于数据完整。
            </p>
          ) : (
            <p>
              由ERP提供public.ai_restock_plan_input视图：工厂、成品、计划窗口、确认需求、可用库存、确定在途、已排产、安全库存、可用产能、统一快照日与来源编号。净缺口=max(需求+安全库存-可用-在途-已排产,0)；建议备货=min(净缺口,可用产能)。
            </p>
          )}
          <p>详细字段及边界验收案例见仓库 docs/ERP数据补充与联调要求.md。</p>
        </details>
      )}
      <Spin spinning={loading}>
        <div className="candidate-grid">
          {candidates.slice((pageIndex - 1) * 6, pageIndex * 6).map((c) => (
            <article className="candidate-card" key={c.id}>
              <header>
                <span className="candidate-id">{c.id}</span>
                <Tag color={c.status === "待定" ? "orange" : "blue"}>
                  {c.status === "待处理" ? "规则候选" : c.status}
                </Tag>
              </header>
              <div className="candidate-product">
                <div>
                  <h2>{c.product}</h2>
                  <p>{c.company}</p>
                </div>
                <div>
                  <strong>{c.qty.toFixed(3)}</strong>
                  <span>实物余额 / 吨</span>
                </div>
              </div>
              <dl>
                {c.facts.slice(0, 4).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <section className="candidate-reason">
                <b>{c.aiText ? "AI分析已就绪" : "建议与核查方向"}</b>
                <p>{c.suggestion}</p>
              </section>
              <footer>
                <Tag>{c.aiText ? "AI已保存" : "AI待分析"}</Tag>
                <Button type="primary" onClick={() => open(c)}>
                  查看依据 / 处理
                </Button>
              </footer>
            </article>
          ))}
        </div>
        {!loading && !error && !candidates.length && (
          <div className="panel">
            <Empty
              description={
                type === "prepare"
                  ? "缺少已确认需求计划、在途与产能数据，暂不生成备货计划"
                  : `当前筛选下没有待处理候选；已处理建议可在下方查阅`
              }
            />
          </div>
        )}
      </Spin>
      {candidates.length > 6 && (
        <Pagination
          current={pageIndex}
          onChange={setPageIndex}
          pageSize={6}
          total={candidates.length}
          showSizeChanger={false}
          showTotal={(n) => `当前展示范围共 ${n} 条候选`}
          style={{ marginTop: 16 }}
        />
      )}
      <div className="coordination-footnote">
        当前为线上ERP规则计算结果；库存更新日期和历史完整性待核实，不自动执行销售、调拨或生产。
        {data?.limitations.map((t) => (
          <div key={t}>{t}</div>
        ))}
      </div>
      <section className="coordination-history">
        <header>
          <div>
            <h2>已处理建议</h2>
            <p>
              保留同意、否决、待定及历次处理记录，点击查看当时证据和AI分析。
            </p>
          </div>
          <Select
            aria-label="处理记录状态"
            value={historyStatus}
            onChange={setHistoryStatus}
            options={["全部", "同意", "否决", "待定"].map((value) => ({
              value,
              label: value,
            }))}
          />
        </header>
        <Table<CoordinationEvent>
          rowKey="id"
          columns={columns}
          dataSource={history}
          size="small"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: "尚无处理记录；上方建议处理后将自动归档到这里" }}
        />
        <p className="muted">
          展示授权范围内最近100次操作；同一建议的历次意见分别保留。
        </p>
      </section>
      <Drawer
        title={historical ? "建议处理快照" : "产销协同建议 · 依据与处理"}
        open={!!detail}
        onClose={() => {
          if (!saving && !aiBusy) setDetail(null);
        }}
        styles={{ wrapper: { width: "min(980px,100vw)" } }}
        destroyOnHidden
      >
        {detail && (
          <>
            {historyEvent && (
              <Alert
                type="info"
                title={`${historyEvent.decision} · ${historyEvent.actor_name} · ${new Date(historyEvent.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`}
                description={historyEvent.note}
              />
            )}
            <Tag>{detail.id}</Tag>
            <h2>{detail.product}</h2>
            <p>
              {detail.company} · 检查日 {detail.checkedAt}
            </p>
            <div className="coordination-detail-grid">
              <section>
                <h3>计算规则</h3>
                <div className="formula-block">{detail.formula}</div>
                <h3>ERP数据依据</h3>
                <dl className="evidence-facts">
                  {detail.facts.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <h3>数据来源与局限</h3>
                <p>{detail.source}</p>
              </section>
              <section className="coordination-ai">
                <header>
                  <h3>AI辅助分析</h3>
                  <Tag color="purple">DeepSeek · LangChain</Tag>
                </header>
                <Spin spinning={aiBusy}>
                  <div className="coordination-ai-text">
                    {detail.aiText ||
                      "尚未生成AI解读。可先查看左侧计算依据，再生成分析；AI不会替代人工决策。"}
                  </div>
                </Spin>
                {!historical && (
                  <Button
                    disabled={!canFeedback || saving}
                    loading={aiBusy}
                    onClick={() => void act("analyze")}
                  >
                    {detail.aiText ? "重新生成AI分析" : "生成AI分析"}
                  </Button>
                )}
              </section>
            </div>
            {!historical && (
              <section className="coordination-review">
                <h3>处理建议</h3>
                <Alert
                  type="info"
                  title="同意仅表示采纳建议进入后续人工安排，不会自动下达业务指令；待定需填写待补事项。"
                />
                <Space style={{ margin: "14px 0" }}>
                  <Select
                    aria-label="建议处理结果"
                    value={decision}
                    onChange={setDecision}
                    disabled={!canFeedback || saving}
                    options={["同意", "否决", "待定"].map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                </Space>
                <Input.TextArea
                  aria-label="建议处理说明"
                  rows={3}
                  maxLength={2000}
                  showCount
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="填写判断依据、计划安排或待补充事项"
                  disabled={!canFeedback || saving}
                />
                <Button
                  type="primary"
                  style={{ marginTop: 20 }}
                  disabled={!canFeedback || aiBusy || !note.trim()}
                  loading={saving}
                  onClick={() => void act("decide")}
                >
                  保存处理结果
                </Button>
              </section>
            )}
            {historical && (
              <Alert
                type="info"
                title="这是处理当时的证据快照，不代表当前库存；处理意见和操作时间见记录列表。"
              />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
