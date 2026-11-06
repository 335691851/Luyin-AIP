import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import Decimal from "decimal.js";
import { z } from "zod";

type EvidenceRow = Record<string, unknown>;
export type PricingLine = {
  materialId: number;
  product: string;
  original: number;
  requested: number;
  qty: number;
  reason: string;
  id?: string;
  version?: number;
  status?: string;
};
export type PricingEvidence = {
  applicant: string;
  lines: PricingLine[];
  sales30Days: EvidenceRow[];
  inventory: EvidenceRow[];
  history: EvidenceRow[];
  missing: string[];
  priceBasis: string;
};
export type PricingFinding = {
  lineId: string;
  materialId: number;
  product: string;
  priceChange: number;
  priceChangePercent: number;
  requestedAmount: number;
  salesQty30Days: number | null;
  averageNetPrice30Days: number | null;
  inventoryByCompany: {
    company: string;
    qty: number;
    reserved: number;
    available: number;
  }[];
  missing: string[];
};
export type PricingGraphTools = {
  sales: () => Promise<EvidenceRow[]>;
  inventory: () => Promise<EvidenceRow[]>;
  history: () => Promise<{ rows: EvidenceRow[]; warning?: string }>;
  assess: (
    evidence: PricingEvidence,
    findings: PricingFinding[],
  ) => Promise<string>;
};

const State = new StateSchema({
  applicant: z.string(),
  lines: z.custom<PricingLine[]>(),
  sales: z.custom<EvidenceRow[]>().optional(),
  inventory: z.custom<EvidenceRow[]>().optional(),
  history: z.custom<{ rows: EvidenceRow[]; warning?: string }>().optional(),
  evidence: z.custom<PricingEvidence>().optional(),
  findings: z.custom<PricingFinding[]>().optional(),
  text: z.string().optional(),
});

function calculateFindings(evidence: PricingEvidence): PricingFinding[] {
  return evidence.lines.map((line, i) => {
    const sale = evidence.sales30Days.find(
      (s) => Number(s.material_id) === line.materialId,
    );
    const inventory = evidence.inventory.filter(
      (s) => Number(s.material_id) === line.materialId,
    );
    const qty = sale ? new Decimal(String(sale.qty)) : null;
    const delta = new Decimal(line.requested).minus(line.original);
    return {
      lineId: line.id || String(i + 1),
      materialId: line.materialId,
      product: line.product,
      priceChange: delta.toDecimalPlaces(2).toNumber(),
      priceChangePercent: delta
        .div(line.original)
        .mul(100)
        .toDecimalPlaces(2)
        .toNumber(),
      requestedAmount: new Decimal(line.requested)
        .mul(line.qty)
        .toDecimalPlaces(2)
        .toNumber(),
      salesQty30Days: qty?.toNumber() ?? null,
      // ERP net revenue is excluding tax. Never compare this directly with the application price.
      averageNetPrice30Days: qty?.gt(0)
        ? new Decimal(String(sale!.revenue))
            .div(qty)
            .toDecimalPlaces(2)
            .toNumber()
        : null,
      inventoryByCompany: inventory.map((s) => ({
        company: String(s.company),
        qty: Number(s.qty),
        reserved: Number(s.reserved),
        available: new Decimal(String(s.qty))
          .minus(String(s.reserved))
          .toNumber(),
      })),
      missing: [
        ...evidence.missing,
        ...(!sale ? ["近30日无匹配有效订单记录；不能推断产品没有需求"] : []),
        ...(!inventory.length
          ? ["未取得授权范围内该产品的库存记录；不能按零库存判断"]
          : []),
      ],
    };
  });
}

// Each branch writes a different state channel. No model or database writes occur during evidence collection.
export function createPricingGraph(tools: PricingGraphTools) {
  return new StateGraph(State)
    .addNode("sales_evidence", async () => ({ sales: await tools.sales() }))
    .addNode("inventory_evidence", async () => ({
      inventory: await tools.inventory(),
    }))
    .addNode("history_evidence", async () => ({
      history: await tools.history(),
    }))
    .addNode("check_evidence", (s) => ({
      evidence: {
        applicant: s.applicant,
        lines: s.lines,
        sales30Days: s.sales!,
        inventory: s.inventory!,
        history: s.history!.rows,
        missing: [
          ...(s.history!.warning ? [s.history!.warning] : []),
          "财务定义且带有效期的集团到合资公司内部结算价尚未接入",
          "库存余额表缺少快照日，工厂库存未建立指定供货工厂映射",
          "历史申请原件与申请理由证据真实性未核实",
        ],
        priceBasis: "申请表为含税元/吨；ERP收入是不含税元，不可直接比价",
      },
    }))
    .addNode("calculate_line_facts", (s) => ({
      findings: calculateFindings(s.evidence!),
    }))
    .addNode("assess_batch", async (s) => {
      const text = (await tools.assess(s.evidence!, s.findings!)).trim();
      if (!text) throw Error("PRICE_ASSESSMENT_EMPTY");
      return { text };
    })
    .addEdge(START, "sales_evidence")
    .addEdge(START, "inventory_evidence")
    .addEdge(START, "history_evidence")
    .addEdge(
      ["sales_evidence", "inventory_evidence", "history_evidence"],
      "check_evidence",
    )
    .addEdge("check_evidence", "calculate_line_facts")
    .addEdge("calculate_line_facts", "assess_batch")
    .addEdge("assess_batch", END)
    .compile();
}

export async function runPricingGraph(
  applicant: string,
  lines: PricingLine[],
  tools: PricingGraphTools,
  signal?: AbortSignal,
) {
  const result = await createPricingGraph(tools).invoke(
    { applicant, lines },
    { signal, recursionLimit: 10, runName: "pricing-assessment" },
  );
  signal?.throwIfAborted();
  return {
    text: result.text!,
    evidence: result.evidence!,
    findings: result.findings!,
    workflow: {
      engine: "langgraph" as const,
      graph: "pricing-assessment",
      steps: [
        "sales_evidence",
        "inventory_evidence",
        "history_evidence",
        "check_evidence",
        "calculate_line_facts",
        "assess_batch",
      ],
    },
  };
}
