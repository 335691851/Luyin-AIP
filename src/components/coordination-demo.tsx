"use client";
import { useState } from "react";
import {
  App,
  Button,
  Drawer,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Tag,
} from "antd";
import {
  ArrowRightOutlined,
  FileSearchOutlined,
  InboxOutlined,
  ShopOutlined,
  DeploymentUnitOutlined,
} from "@ant-design/icons";
import { companies, products } from "@/lib/demo";
import { isTailStock, monthCutoff, shanghaiToday } from "@/lib/domain";
type Candidate = {
  id: string;
  company: string;
  product: string;
  qty: number;
  date: string;
  priority: string;
  facts: [string, string][];
  suggestion: string;
  formula: string;
  source: string;
};
export default function CoordinationCards({
  demo,
  allowedCompanies,
  canFeedback,
  company,
  search,
}: {
  demo: boolean;
  allowedCompanies: string[];
  canFeedback: boolean;
  company: string;
  search: string;
}) {
  const { message } = App.useApp();
  const [type, setType] = useState("tail"),
    [detail, setDetail] = useState<Candidate | null>(null),
    [feedback, setFeedback] = useState<Candidate | null>(null),
    [decision, setDecision] = useState("暂缓"),
    [note, setNote] = useState(""),
    [saved, setSaved] = useState<Record<string, string>>({});
  const today = shanghaiToday();
  const all: Record<string, Candidate[]> = {
    tail: [
      {
        id: "TAIL-DEMO-001",
        company: companies[1],
        product: products[0],
        qty: 0.32,
        date: "2026-06-18",
        priority: "优先核查",
        facts: [
          ["首次入库", "2026-06-18"],
          ["库存形态", "成品批次余量"],
          ["库龄条件", `早于${monthCutoff(today)}`],
          ["数量条件", "0 < 0.32 < 0.5吨"],
        ],
        suggestion:
          "先核实质量、货权与可销售状态，再评估同规格需求匹配或合规处置。",
        formula: `首次入库日 < ${monthCutoff(today)} 且 0 < 剩余量 < 0.5吨`,
        source: "虚构批次入库样例 / 剩余库存样例",
      },
      {
        id: "TAIL-DEMO-002",
        company: companies[3],
        product: products[5],
        qty: 0.46,
        date: "2026-07-03",
        priority: "待核查",
        facts: [
          ["首次入库", "2026-07-03"],
          ["库存形态", "成品批次余量"],
          ["库龄条件", `早于${monthCutoff(today)}`],
          ["数量条件", "0 < 0.46 < 0.5吨"],
        ],
        suggestion:
          "核实批次是否仍可流通，补充近期同规格需求与库存冻结信息后决定处理方式。",
        formula: `首次入库日 < ${monthCutoff(today)} 且 0 < 剩余量 < 0.5吨`,
        source: "虚构批次入库样例 / 剩余库存样例",
      },
    ],
    clear: [
      {
        id: "CLEAR-DEMO-001",
        company: companies[3],
        product: products[1],
        qty: 12,
        date: today,
        priority: "动销偏慢",
        facts: [
          ["近30天净发出", "4.50吨"],
          ["日均净销量", "0.15吨/日"],
          ["可用库存", "12.00吨"],
          ["库存覆盖", "80天 / 阈值60天"],
        ],
        suggestion:
          "核对渠道近期需求，优先形成现有库存销售计划；具体客户和价格由业务人员确认。",
        formula: "覆盖天数 = 12 ÷ (4.5 ÷ 30) = 80天 > 60天演示阈值",
        source: "虚构库存快照 / 30天发出样例",
      },
    ],
    prepare: [
      {
        id: "PREPARE-DEMO-001",
        company: companies[1],
        product: products[2],
        qty: 16,
        date: today,
        priority: "存在缺口",
        facts: [
          ["预计需求", "35.00吨"],
          ["安全库存", "5.00吨"],
          ["当前可用", "20.00吨"],
          ["确认在途", "4.00吨"],
        ],
        suggestion:
          "建议核实16吨供给缺口。交期、产能与最小生产批量未确认前，不直接下达生产计划。",
        formula: "缺口 = max(0,35 + 5 − 20 − 4) = 16吨；本例预计需求已含订单",
        source: "虚构需求计划 / 库存与在途样例",
      },
    ],
  };
  const candidates = demo
    ? all[type].filter(
        (c) =>
          (type !== "tail" || isTailStock(today, c.date, c.qty)) &&
          allowedCompanies.includes(c.company) &&
          (!company || c.company === company) &&
          (!search || [c.product, c.company, c.id].join(" ").includes(search)),
      )
    : [];
  const definitions = [
    {
      id: "tail",
      name: "成品尾库清理",
      desc: "超3个自然月 · 小量批次",
      icon: <InboxOutlined aria-hidden />,
    },
    {
      id: "clear",
      name: "库存销售计划",
      desc: "库存覆盖与动销变化",
      icon: <ShopOutlined aria-hidden />,
    },
    {
      id: "prepare",
      name: "工厂备货计划",
      desc: "需求、可用与在途对照",
      icon: <DeploymentUnitOutlined aria-hidden />,
    },
  ];
  return (
    <div className="coordination-workspace">
      <div className="coordination-types">
        {definitions.map((t) => (
          <button
            key={t.id}
            className={type === t.id ? "active" : ""}
            onClick={() => setType(t.id)}
          >
            {t.icon}
            <span>
              <b>{t.name}</b>
              <small>{t.desc}</small>
            </span>
            <em>{demo ? all[t.id].length : "—"}</em>
          </button>
        ))}
      </div>
      <div className="candidate-summary">
        <span>
          <b>{candidates.length}</b> 条待核查建议
        </span>
        <span>
          {type === "prepare" ? "建议缺口" : "涉及余量"}{" "}
          <strong>
            {candidates.reduce((s, c) => s + c.qty, 0).toFixed(2)}
          </strong>{" "}
          吨
        </span>
        <span>规则检查日 {today}</span>
        <small>
          {type === "tail"
            ? `截止日 ${monthCutoff(today)} · 小量 < 0.5吨`
            : "计算过程与输入证据逐项保留"}
        </small>
      </div>
      <div className="candidate-grid">
        {candidates.map((c) => (
          <article className="candidate-card" key={c.id}>
            <header>
              <span className="candidate-id">{c.id}</span>
              <Tag color={saved[c.id] ? "default" : "gold"}>
                {saved[c.id] || c.priority}
              </Tag>
            </header>
            <div className="candidate-product">
              <div>
                <h2>{c.product}</h2>
                <p>{c.company}</p>
              </div>
              <div>
                <strong>{c.qty.toFixed(2)}</strong>
                <span>{type === "prepare" ? "建议缺口" : "当前余量"} / 吨</span>
              </div>
            </div>
            <dl>
              {c.facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <section className="candidate-reason">
              <b>建议与关注</b>
              <p>{c.suggestion}</p>
            </section>
            <footer>
              <span>
                <FileSearchOutlined aria-hidden /> 演示证据 · 待业务核实
              </span>
              <Space>
                <Button type="text" onClick={() => setDetail(c)}>
                  查看依据
                </Button>
                <Button
                  disabled={!canFeedback}
                  onClick={() => {
                    if (!canFeedback) return;
                    setFeedback(c);
                    setNote("");
                  }}
                >
                  处理反馈 <ArrowRightOutlined aria-hidden />
                </Button>
              </Space>
            </footer>
          </article>
        ))}
      </div>
      {!candidates.length && (
        <div className="panel">
          <Empty
            description={
              demo
                ? "当前筛选无匹配建议"
                : "库存与需求证据尚未接入，不生成无依据建议"
            }
          />
        </div>
      )}
      <div className="coordination-footnote">
        本页仅提供固定规则建议，不自动执行销售、调拨或生产。
        {demo ? "样例输入为虚构数据，反馈仅用于本页演示。" : ""}
      </div>
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title="建议数据依据"
        size={520}
      >
        {detail && (
          <>
            <Tag>{detail.id}</Tag>
            <h2>{detail.product}</h2>
            <p>{detail.company}</p>
            <h3>触发规则与计算</h3>
            <div className="formula-block">{detail.formula}</div>
            <h3>证据输入</h3>
            <dl className="evidence-facts">
              {detail.facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3>来源</h3>
            <p>{detail.source}</p>
            <div className="note">
              这是界面演示的可解释规则输出，不代表已经查询真实ERP库存。
            </div>
          </>
        )}
      </Drawer>
      <Modal
        open={!!feedback}
        title="记录处理反馈（演示）"
        onCancel={() => setFeedback(null)}
        onOk={() => {
          if (!note.trim()) return void message.warning("请填写处理说明");
          if (feedback) setSaved((s) => ({ ...s, [feedback.id]: decision }));
          setFeedback(null);
          message.success("本页演示反馈已记录，尚未写入正式业务库");
        }}
      >
        <p>{feedback?.product}</p>
        <Select
          value={decision}
          onChange={setDecision}
          options={["接受建议", "调整建议", "暂缓", "拒绝"].map((s) => ({
            value: s,
            label: s,
          }))}
          style={{ width: "100%", marginBottom: 14 }}
        />
        <Input.TextArea
          aria-label="处理反馈说明"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="说明处理判断和仍需补充的证据"
        />
      </Modal>
    </div>
  );
}
