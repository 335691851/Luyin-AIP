"use client";
import { useEffect, useState } from "react";
import { Alert, App, Button, Drawer, Table, Tag } from "antd";
export default function ContractRisk() {
  const { message } = App.useApp();
  const [month, setMonth] = useState("2026-10"),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState<any>(null);
  const load = async (signal?: AbortSignal) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/contracts/risk?month=${month}`, { signal });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRows(d.rows);
      setError(
        d.erpWarning || (d.truncated ? "超过500个订单，请缩小分析期间" : ""),
      );
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [month]);
  return (
    <>
      <div className="panel-title">
        <h2>集团合同、内部凭证与账务勾稽</h2>
        <label>
          订单期间{" "}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <Button onClick={() => void load()}>重新核查</Button>
      </div>
      <Alert
        type="info"
        title="集团法人核查。平台模拟样本独立标记，用于演练合同、应收与凭证勾稽，不计作ERP真实经营数据；规则命中需人工复核。"
      />
      {error && <Alert type="warning" title={error} />}
      <div className="kpi-row">
        {[
          ["集团订单", rows.length],
          ["待核查订单", rows.filter((r) => r.issues.length).length],
          [
            "匹配账务单据",
            rows.reduce((n, r) => n + r.accounting_documents, 0),
          ],
          ["借贷异常凭证", rows.reduce((n, r) => n + r.unbalanced, 0)],
        ].map(([k, v]) => (
          <div className="kpi" key={k}>
            <span>{k}</span>
            <strong>{busy ? "—" : v}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <Table
          rowKey="id"
          loading={busy}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
          columns={[
            {
              title: "订单",
              dataIndex: "bill_no",
              render: (v, r) => (
                <>
                  <Button type="link" onClick={() => setActive(r)}>
                    {v}
                  </Button>
                  {r.is_simulated && (
                    <Tag color="orange">
                      {r.data_source === "platform_simulation"
                        ? "平台演练"
                        : "ERP模拟"}
                    </Tag>
                  )}
                </>
              ),
            },
            { title: "客户", dataIndex: "customer" },
            { title: "年度合同候选", dataIndex: "annual_candidates" },
            {
              title: "应收单 / 凭证",
              render: (_, r) => `${r.accounting_documents} / ${r.vouchers}`,
            },
            {
              title: "核查线索",
              render: (_, r) =>
                r.issues.length
                  ? r.issues.map((s: string) => (
                      <Tag color="gold" key={s}>
                        {s}
                      </Tag>
                    ))
                  : "本轮规则未命中，不代表全面合规",
            },
          ]}
        />
      </section>
      <Drawer
        title="风险证据与关联处置"
        open={!!active}
        onClose={() => setActive(null)}
        size={760}
      >
        {active && (
          <>
            <h2>{active.bill_no}</h2>
            <p>
              {active.customer} · {active.bill_date}
            </p>
            <p>
              订单不含税收入：{active.revenue}元；账务单据：
              {active.bill_refs || "尚未形成"}；凭证借方{active.debit}元 / 贷方
              {active.credit}元
            </p>
            <p>{active.basis}</p>
            <ul>
              {active.issues.map((s: string) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <Button
              disabled={!active.issues.length || busy}
              type="primary"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch("/api/governance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      view: "group",
                      company: "山东省鲁盐集团有限公司",
                      action: "create",
                      kind: "contract_risk",
                      category: "重大事项程序",
                      title: `合同账务核查：${active.bill_no}`,
                      owner: "集团财务与法务联合核查岗",
                      deadline: new Date(Date.now() + 7 * 86400000)
                        .toISOString()
                        .slice(0, 10),
                      basis: active.basis,
                      materials: `订单${active.bill_no}；应收单${active.bill_refs || "未形成"}；凭证数${active.vouchers}`,
                      finding:
                        active.issues.join("；") +
                        (active.is_simulated
                          ? "（源ERP模拟记录，作为核查演练）"
                          : ""),
                    }),
                  });
                  const d = await r.json();
                  if (!r.ok) throw Error(d.error);
                  message.success("已登记集团合同核查事项并留痕");
                } catch (e) {
                  message.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              登记合同风险处置事项
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
